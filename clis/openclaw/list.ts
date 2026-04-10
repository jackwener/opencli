/**
 * OpenCLI list - 获取文档顶层分类列表
 *
 * Usage:
 *   opencli openclaw list
 *   opencli openclaw list --lang zh-CN
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { getBaseUrl } from './tool.js';

export interface Category {
  title: string;
  path: string;
}

/**
 * 提取文档分类列表
 *
 * @param page - Playwright page 对象（需已导航到文档首页）
 */
export async function extractCategories(page: any): Promise<Category[]> {
  return await page.evaluate(`
    (() => {
      const results = [];
      const seen = new Set();

      const headerSelectors = [
        'header a[href]', 'nav a[href]', '.vp-header a[href]',
        '.navbar a[href]', '[class*="header"] a[href]', '[class*="nav"] a[href]'
      ];

      for (const selector of headerSelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const href = el.getAttribute('href');
          const text = el.textContent?.trim() || '';
          if (text && href && !seen.has(href) &&
              (href.startsWith('/') || href.startsWith('.')) &&
              text.length > 1 && text.length < 30 &&
              !href.includes('#') && !href.includes('?')) {
            seen.add(href);
            results.push({ title: text, path: href });
          }
        });
        if (results.length > 0) break;
      }

      if (results.length < 3) {
        results.length = 0;
        seen.clear();
        const sidebarSelectors = [
          '.vp-sidebar .sidebar-item', '.vp-sidebar > ul > li > a',
          '.sidebar > .sidebar-links > li > a', '.sidebar a[href]', 'aside.sidebar a[href]'
        ];
        for (const selector of sidebarSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length === 0) continue;
          elements.forEach(el => {
            const href = el.getAttribute('href');
            const text = el.textContent?.trim() || '';
            const parent = el.parentElement;
            const grandparent = parent?.parentElement;
            const isTopLevel = grandparent && (
              grandparent.classList?.contains('sidebar') ||
              grandparent.classList?.contains('vp-sidebar') ||
              grandparent.tagName === 'ASIDE'
            );
            if (text && href && !seen.has(href) &&
                (href.startsWith('/') || href.startsWith('.')) &&
                text.length > 1 && text.length < 30 &&
                !href.includes('#') && (isTopLevel || elements.length < 15)) {
              seen.add(href);
              results.push({ title: text, path: href });
            }
          });
          if (results.length >= 3) break;
        }
      }

      return results;
    })()
  `) as Category[];
}

cli({
  site: 'openclaw',
  name: 'list',
  description: '获取 OpenCLI 文档顶层分类列表',
  domain: 'docs.openclaw.ai',
  strategy: Strategy.PUBLIC,
  browser: true,
  args: [
    { name: 'lang', default: 'en', help: '语言: en 或 zh-CN' },
  ],
  columns: ['title', 'path'],
  func: async (page, kwargs) => {
    const baseUrl = await getBaseUrl(kwargs.lang);
    await page.goto(baseUrl);
    await page.wait(3);
    return await extractCategories(page);
  },
});
