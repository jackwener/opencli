import { cli, Strategy } from '../../registry.js';

cli({
  site: 'wanfang',
  name: 'search',
  description: '万方数据论文搜索',
  domain: 's.wanfangdata.com.cn',
  strategy: Strategy.PUBLIC,
  browser: true,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 20)' },
  ],
  columns: ['rank', 'title', 'authors', 'source', 'year', 'type', 'cited', 'url'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    const query = encodeURIComponent(kwargs.query);
    await page.goto(`https://s.wanfangdata.com.cn/paper?q=${query}`);
    await page.wait(5);

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        for (let i = 0; i < 30; i++) {
          if (document.querySelectorAll('span.title').length > 0) break;
          await new Promise(r => setTimeout(r, 500));
        }
        const titleSpans = document.querySelectorAll('span.title');
        const results = [];
        for (const titleSpan of titleSpans) {
          const title = normalize(titleSpan.textContent);
          if (!title || title.length < 3) continue;
          // Walk up to find the result container (div.detail-list-wrap or similar)
          let container = titleSpan.parentElement;
          for (let i = 0; i < 6; i++) {
            if (!container.parentElement || container.parentElement.tagName === 'BODY') break;
            // Check if this container has exactly one span.title
            if (container.querySelectorAll('span.title').length >= 1 && container.querySelectorAll('span.authors').length >= 1) break;
            container = container.parentElement;
          }
          const idEl = container.querySelector('span.title-id-hidden');
          const id = normalize(idEl?.textContent);
          let url = '';
          if (id) url = 'https://d.wanfangdata.com.cn/' + id;

          const authorEls = container.querySelectorAll('span.authors');
          const authors = Array.from(authorEls).map(a => normalize(a.textContent)).filter(Boolean).join(', ').slice(0, 80);

          const typeEl = container.querySelector('span.essay-type');
          const type = normalize(typeEl?.textContent);

          const periodicalEl = container.querySelector('span.periodical, span.source');
          const source = normalize(periodicalEl?.textContent);

          const yearEl = container.querySelector('span.year, span.date');
          let year = normalize(yearEl?.textContent);
          if (!year) {
            const allText = container.textContent || '';
            const ym = allText.match(/(19|20)\\d{2}/);
            year = ym?.[0] || '';
          }

          const citedEl = container.querySelector('.stat-item.quote, [class*="quote"]');
          const citedMatch = normalize(citedEl?.textContent).match(/(\\d+)/);
          const cited = citedMatch?.[1] || '0';

          results.push({ rank: results.length + 1, title, authors, source, year, type, cited, url });
          if (results.length >= ${limit}) break;
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
