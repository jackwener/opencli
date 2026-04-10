/**
 * OpenCLI read - 读取文档内容
 *
 * Usage:
 *   opencli openclaw read --path "/guide/intro"
 *   opencli openclaw read --path "/guide/intro" --lang zh-CN
 *
 * 核心函数:
 *   extractContent(page) - 提取页面内容
 *   postProcessFile(mdPath) - 后处理 Markdown 文件
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { downloadArticle } from '@jackwener/opencli/download/article-download';
import { getBaseUrl, getDefaultLang, safeTitle, fixWindowsPath } from './tool.js';

export interface Content {
  title: string;
  contentHtml: string;
  imageUrls: string[];
  sourceUrl: string;
}

/**
 * 提取文档内容
 *
 * @param page - Playwright page 对象（需已导航到文档页面）
 * @returns 包含 title, contentHtml, imageUrls 的对象
 */
export async function extractContent(page: any): Promise<Content> {
  return await page.evaluate(`
    (() => {
      const result = { title: '', contentHtml: '', imageUrls: [] };

      // 标题提取 - 优先使用 og:title meta 标签
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        result.title = ogTitle.getAttribute('content')?.trim() || '';
      }
      // 降级到 document.title
      if (!result.title) {
        result.title = document.title?.trim() || '';
      }
      // 清理标题后缀（如 " - OpenCLI"）
      result.title = result.title.replace(/\\s*[|\\-–—]\\s*OpenCLI.*$/, '').trim() || 'untitled';

      // 内容提取 - 尝试多个选择器找到主要内容区域
      let contentEl = null;
      const contentSelectors = [
        'article',          // 标准文章标签
        '[role="main"]',   // ARIA 主内容区
        'main',            // HTML5 main 标签
        '.mdx-content',    // MDX 内容容器
        '.content',         // 通用内容类名
        '.docs-content'     // 文档内容类名
      ];

      for (const selector of contentSelectors) {
        const el = document.querySelector(selector);
        if (el && (el.textContent?.length || 0) > 200) {
          contentEl = el;
          break;
        }
      }

      // 如果都没找到，使用 body
      if (!contentEl) {
        contentEl = document.body;
      }

      // 克隆并清理噪音元素（导航、侧边栏、搜索等）
      const clone = contentEl.cloneNode(true);
      const noise = [
        'nav', 'header:not(article header)', 'footer:not(article footer)', 'aside',
        '.navbar', '.nav', '.sidebar', '.menu', '.header', '.footer',
        '.sidebar-content', '#sidebar', '#navbar', '#table-of-contents',
        '[class*="sidebar"]', '[class*="nav-"]', '[class*="navbar"]',
        '.search', '#search', '[class*="search"]',
        '[data-testid*="search"]', '#search-bar-entry', '#search-bar-entry-mobile',
        '.nav-logo', '[class*="logo"]', '[class*="brand"]', 'picture',
        '#localization-select-trigger', '[class*="localization"]', '[class*="language"]',
        '.toc', '#table-of-contents', '[class*="table-of-contents"]',
        '#content-side-layout', '.content-side-layout', '#background-color',
        '.comments', '.comment', '.ad', '.ads', '.advertisement', '[class*="advertisement"]',
        'script', 'style', 'noscript', 'iframe', 'template',
        '[hidden]', '[aria-hidden="true"]', '.sr-only', '.visually-hidden',
        '[data-component-part="copy-code-button"]', '[data-rmiz]', '[aria-owns*="rmiz"]',
        '.code-block[data-floating-buttons]', '[data-custom-css-index]'
      ].join(', ');

      clone.querySelectorAll(noise).forEach(el => el.remove());
      result.contentHtml = clone.innerHTML;

      // 图片提取 - 去重
      const seen = new Set();
      clone.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('data-src')
          || img.getAttribute('data-original')
          || img.getAttribute('src');
        if (src && !src.startsWith('data:') && !seen.has(src)) {
          seen.add(src);
          result.imageUrls.push(src);
        }
      });

      return result;
    })()
  `) as Content;
}

/**
 * 后处理 Markdown 文件
 *
 * 修复各种提取和转换过程中的问题：
 * - 被拆分的标题
 * - 残留的空标题标记
 * - frontmatter 格式
 * - 原文链接位置
 *
 * @param mdPath - Markdown 文件路径
 */
export function postProcessFile(mdPath: string): void {
  try {
    let content = fs.readFileSync(mdPath, 'utf-8');

    // 1. 修复被拆分的标题: ## + [](#xxx) + 标题文本 → ## 标题
    content = content.replace(/^##\s*\n+\[\s*​?\s*\]\(#([^)]+)\)\s*\n+([^#\n-][^\n]+)/gm, (_, anchor, title) => {
      return `## ${title.trim()}`;
    });

    // 2. 修复 frontmatter 格式: # 标题 - OpenClaw → > OpenClaw - 标题
    content = content.replace(/^# (.+) - OpenClaw\s*$/m, '> OpenClaw - $1');

    // 3. 把 > 原文链接: 行移到文件末尾
    let sourceUrl = '';
    content = content.replace(/^> 原文链接:\s*(.+)\s*$/gm, (_, url) => {
      sourceUrl = `> 原文链接: ${url.trim()}`;
      return '';
    });

    // 4. 清理残留的空标题标记 ## 和 #
    content = content.replace(/^##\s*$/gm, '');
    content = content.replace(/^#\s*$/gm, '');

    // 5. 清理残留的空链接行
    content = content.replace(/^\[\s*​?\s*\]\(#[^)]+\)\s*$/gm, '');
    content = content.replace(/^\[\s*​?\s*\n+\s*\]\(#[^)]+\)\s*$/gm, '');

    // 6. 如果正文第一段是中文标题（页面 h1），添加 # 标记
    content = content.replace(/^---[\s\n]*([\u4e00-\u9fff])/m, '---\n\n# $1');

    // 7. 清理开头的噪音：blockquotes (如 "> OpenClaw - xxx") 和多余的 ---
    content = content.replace(/^> OpenClaw - [^\n]+\n*/gm, '');
    content = content.replace(/^---\n*/gm, '');

    // 8. 清理多余空行
    content = content.replace(/\n{4,}/g, '\n\n');

    // 9. 将原文链接追加到文件末尾
    if (sourceUrl) {
      content = content.trim() + '\n\n' + sourceUrl + '\n';
    }

    fs.writeFileSync(mdPath, content, 'utf-8');
  } catch {
    // ignore errors
  }
}

cli({
  site: 'openclaw',
  name: 'read',
  description: '读取 OpenCLI docs',
  domain: 'docs.openclaw.ai',
  strategy: Strategy.PUBLIC,
  browser: true,
  args: [
    { name: 'path', required: true, help: '文档路径，如 /guide/intro（不需要包含 /zh-CN 前缀）' },
    { name: 'lang', default: 'en', help: '语言: en 或 zh-CN' },
    { name: 'output', default: './openclaw-docs', help: '输出目录' },
    { name: 'download-images', type: 'boolean', default: false, help: '是否下载图片' },
    { name: 'wait', type: 'int', default: 3, help: '页面加载后等待秒数' }
  ],
  columns: ['title', 'url', 'size'],
  func: async (page, kwargs) => {
    const lang = kwargs.lang || getDefaultLang();
    const baseUrl = await getBaseUrl(lang);
    const pathArg = kwargs.path;
    const waitSeconds = kwargs.wait ?? 3;

    // 构建完整 URL
    let url = pathArg;
    if (!url.startsWith('http')) {
      // 避免 Windows 路径问题：如果 path 是 /D:/xxx 格式，修正为 /xxx
      url = fixWindowsPath(url);

      if (!url.startsWith('/')) url = '/' + url;

      // 如果 path 已经包含语言前缀(如 /zh-CN/xxx)，则直接使用 baseUrl
      // 否则添加语言前缀
      const pathLangPrefix = '/' + lang;
      if (url.startsWith(pathLangPrefix + '/') || url === pathLangPrefix) {
        url = baseUrl.replace(/\/zh-CN$/, '') + url;
      } else {
        url = baseUrl + url;
      }
    }

    // 导航到文档页面
    await page.goto(url);
    await page.wait(waitSeconds);

    // 提取文档内容
    const data = await extractContent(page);

    // 计算内容大小
    const size = (data?.contentHtml?.length || 0);

    // 下载文章
    const downloadResult = await downloadArticle(
      {
        title: data?.title || 'untitled',
        sourceUrl: url,
        contentHtml: data?.contentHtml || '',
        imageUrls: data?.imageUrls,
      },
      {
        output: kwargs.output,
        downloadImages: kwargs['download-images'],
      }
    );

    // 后处理文件
    const safeTitleStr = safeTitle(data?.title || 'untitled');
    const mdPath = path.join(kwargs.output, safeTitleStr, `${safeTitleStr}.md`);
    postProcessFile(mdPath);

    const result = downloadResult[0] || {};
    return [{
      title: data?.title || result.title || 'untitled',
      url: url,
      size: size ?? result.size,
    }];
  },
});
