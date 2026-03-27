import { cli, Strategy } from '../../registry.js';
import { CommandExecutionError, EmptyResultError } from '../../errors.js';

cli({
  site: 'runoob',
  name: 'search',
  description: '搜索菜鸟教程内容',
  domain: 'www.runoob.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    {
      name: 'query',
      required: true,
      positional: true,
      help: '搜索关键词',
    },
    {
      name: 'limit',
      type: 'int',
      default: 20,
      help: '返回结果数量（默认20）',
    },
  ],
  columns: ['rank', 'title', 'category', 'url'],

  func: async (page, kwargs) => {
    const query = String(kwargs.query || '').trim();
    const limit = Math.min(Math.max(Number(kwargs.limit || 20), 1), 100);

    if (!query) {
      throw new CommandExecutionError('搜索关键词不能为空');
    }

    const url = `https://www.runoob.com/?s=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.wait(3);

    await page.autoScroll({ times: 3, delayMs: 1000 });

    const results = await page.evaluate(
      (maxResults: number) => {
        const items: Array<Record<string, string>> = [];

        // 尝试多种选择器
        const selectors = [
          '.search-item',
          '.result-item',
          '.article-list li',
          '.content-list li',
          '.item-list .item',
          '[class*="search"]',
          'main li',
          '.main-content li',
        ];

        let rows: Element[] = [];
        for (const sel of selectors) {
          const found = document.querySelectorAll(sel);
          if (found.length > 0) {
            rows = Array.from(found);
            break;
          }
        }

        // 备用：从页面链接提取
        if (rows.length === 0) {
          const allLinks = document.querySelectorAll('a[href*="runoob.com"]');
          const seen = new Set<string>();
          allLinks.forEach((link) => {
            const href = link.href;
            const text = link.textContent?.trim() || '';
            if (
              href &&
              text &&
              text.length > 5 &&
              text.length < 200 &&
              !seen.has(href) &&
              (href.includes('/html/') ||
                href.includes('/css/') ||
                href.includes('/js/') ||
                href.includes('/python/') ||
                href.includes('/php/') ||
                href.includes('/sql/') ||
                href.includes('/java/') ||
                href.includes('/vue/') ||
                href.includes('/react/') ||
                href.includes('/node/'))
            ) {
              seen.add(href);
              items.push({
                rank: String(items.length + 1),
                title: text,
                category: '',
                url: href,
              });
            }
          });
        }

        rows.forEach((row, index) => {
          if (index >= maxResults) return;

          const link = row.querySelector('a[href]');
          const title = link?.textContent?.trim() || row.textContent?.trim() || '';
          const href = link?.href || '';

          if (title && href && title.length > 3) {
            items.push({
              rank: String(items.length + 1),
              title: title.substring(0, 200),
              category: '',
              url: href,
            });
          }
        });

        return items.slice(0, maxResults);
      },
      limit,
    );

    if (!results?.length) {
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('登录') || pageText.includes('login')) {
        throw new CommandExecutionError(
          '菜鸟教程可能需要登录，请在 Chrome 中登录后重试',
        );
      }
      throw new EmptyResultError('runoob search', `未找到"${query}"的相关教程`);
    }

    return results;
  },
});
