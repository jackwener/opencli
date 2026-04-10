/**
 * OpenCLI all - 下载所有文档
 *
 * Usage:
 *   opencli openclaw all
 *   opencli openclaw all --lang zh-CN
 *
 * 依赖:
 *   extractCategories() from './list' - 获取分类列表
 *   extractContent() from './read' - 提取文档内容
 *   postProcessFile() from './read' - 后处理文件
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { getBaseUrl, getDefaultLang, buildDocUrl, safeTitle } from './tool.js';
import { downloadArticle } from '@jackwener/opencli/download/article-download';
import { extractCategories, type Category } from './list.js';
import { extractContent, postProcessFile } from './read.js';

cli({
  site: 'openclaw',
  name: 'all ',
  description: '下载所有 OpenCLI 文档',
  domain: 'docs.openclaw.ai',
  strategy: Strategy.PUBLIC,
  browser: true,
  timeoutSeconds: 300,
  args: [
    { name: 'lang', default: 'en', help: '语言: en, zh-CN, ja-JP 等' },
    { name: 'output', default: './openclaw-docs', help: '输出目录' },
    { name: 'download-images', type: 'boolean', default: false, help: '是否下载图片' },
  ],
  columns: ['title', 'path', 'status'],
  func: async (page, kwargs) => {
    const lang = kwargs.lang || getDefaultLang();
    const baseUrl = await getBaseUrl(lang);
    const results: Array<{ title: string; path: string; status: string }> = [];
    const maxRetries = 3;

    // 1. 获取顶层分类列表（复用 list.ts 的 extractCategories 函数）
    await page.goto(baseUrl);
    await page.wait(3);
    const categories = await extractCategories(page);

    if (!categories || categories.length === 0) {
      return [{ title: 'No categories found', path: baseUrl, status: 'failed' }];
    }

    // 2. 下载每个分类（复用 read.ts 的 extractContent 和 postProcessFile 函数）
    // 失败的重试放到最后
    const failedCategories: Category[] = [];

    for (const cat of categories as Category[]) {
      const success = await downloadCategory(page, cat, baseUrl, kwargs);
      if (success) {
        results.push({ title: cat.title, path: cat.path, status: 'success' });
      } else {
        failedCategories.push(cat);
        results.push({ title: cat.title, path: cat.path, status: 'pending' });
      }
    }

    // 3. 重试失败的分类
    for (const cat of failedCategories) {
      let success = false;
      for (let retry = 1; retry <= maxRetries; retry++) {
        // 等待后再重试
        await page.wait(5000 * retry);
        success = await downloadCategory(page, cat, baseUrl, kwargs);
        if (success) break;
      }
      // 更新结果状态
      const resultItem = results.find(r => r.path === cat.path);
      if (resultItem) {
        resultItem.status = success ? 'success' : 'failed';
      }
    }

    return results;
  },
});

/**
 * 下载单个分类文档
 *
 * @returns 是否成功
 */
async function downloadCategory(
  page: any,
  cat: Category,
  baseUrl: string,
  kwargs: any
): Promise<boolean> {
  try {
    const catUrl = buildDocUrl(baseUrl, cat.path);
    await page.goto(catUrl);
    // 随机等待 3-5 秒，避免请求过快
    await page.wait(3000 + Math.random() * 2000);

    // 提取内容（复用 read.ts 的逻辑）
    const data = await extractContent(page);

    // 下载文档
    await downloadArticle(
      {
        title: data.title || cat.title,
        sourceUrl: catUrl,
        contentHtml: data.contentHtml,
        imageUrls: data.imageUrls,
      },
      {
        output: kwargs.output,
        downloadImages: kwargs['download-images'],
      }
    );

    // 后处理文件
    const safeTitleStr = safeTitle(data.title || cat.title);
    const mdPath = `${kwargs.output}/${safeTitleStr}/${safeTitleStr}.md`;
    postProcessFile(mdPath);

    return true;
  } catch {
    return false;
  }
}
