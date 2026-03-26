/**
 * 36kr hot-list — INTERCEPT strategy.
 *
 * Navigates to the 36kr hot-list page and scrapes rendered article links.
 * Supports category types: renqi (人气), zonghe (综合), shoucang (收藏), catalog (综合热门).
 */
import { cli, Strategy } from '../../registry.js';
import { CliError } from '../../errors.js';
import type { IPage } from '../../types.js';

const TYPE_MAP: Record<string, string> = {
  renqi:   '人气榜',
  zonghe:  '综合榜',
  shoucang: '收藏榜',
  catalog: '热门资讯',
};

function getShanghaiDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function buildHotListUrl(listType: string, date = new Date()): string {
  if (listType === 'catalog') {
    return 'https://www.36kr.com/hot-list/catalog';
  }

  return `https://www.36kr.com/hot-list/${listType}/${getShanghaiDate(date)}/1`;
}

cli({
  site: '36kr',
  name: 'hot',
  description: '36氪热榜 — trending articles (renqi/zonghe/shoucang/catalog)',
  domain: 'www.36kr.com',
  strategy: Strategy.INTERCEPT,
  args: [
    { name: 'limit', type: 'int', default: 20, help: 'Number of items (max 50)' },
    {
      name: 'type',
      type: 'string',
      default: 'catalog',
      help: 'List type: renqi (人气), zonghe (综合), shoucang (收藏), catalog (热门资讯)',
    },
  ],
  columns: ['rank', 'title', 'url'],
  func: async (page: IPage, args) => {
    const count = Math.min(Number(args.limit) || 20, 50);
    const listType = String(args.type ?? 'catalog');

    if (!TYPE_MAP[listType]) {
      throw new CliError(
        'INVALID_ARGUMENT',
        `Unknown type "${listType}". Valid types: ${Object.keys(TYPE_MAP).join(', ')}`,
      );
    }

    const url = buildHotListUrl(listType);

    await page.installInterceptor('36kr.com/api');
    await page.goto(url);
    await page.wait(6);

    // Scrape rendered article links from DOM (deduplicated)
    const domItems: any = await page.evaluate(`
      (() => {
        const seen = new Set();
        const results = [];
        const links = document.querySelectorAll('a[href*="/p/"]');
        for (const el of links) {
          const href = el.getAttribute('href') || '';
          const title = el.textContent?.trim() || '';
          if (!title || title.length < 5 || seen.has(href) || seen.has(title)) continue;
          seen.add(href);
          seen.add(title);
          results.push({ title, url: href.startsWith('http') ? href : 'https://36kr.com' + href });
        }
        return results;
      })()
    `);

    const items = Array.isArray(domItems) ? (domItems as any[]) : [];
    if (items.length === 0) {
      throw new CliError(
        'NO_DATA',
        'Could not retrieve 36kr hot list',
        '36kr may have changed its DOM structure',
      );
    }

    return items.slice(0, count).map((item: any, i: number) => ({
      rank: i + 1,
      title: item.title,
      url: item.url,
    }));
  },
});

export { buildHotListUrl, getShanghaiDate };
