import { cli, Strategy } from '../../registry.js';

cli({
  site: 'cnki',
  name: 'search',
  description: '中国知网论文搜索（海外版）',
  domain: 'oversea.cnki.net',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 20)' },
  ],
  columns: ['rank', 'title', 'authors', 'journal', 'date', 'url'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    const query = encodeURIComponent(kwargs.query);

    await page.goto(`https://oversea.cnki.net/kns/search?dbcode=CFLS&kw=${query}&korder=SU`);
    await page.wait(8);

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        for (let i = 0; i < 40; i++) {
          if (document.querySelector('.result-table-list tbody tr, #gridTable tbody tr')) break;
          await new Promise(r => setTimeout(r, 500));
        }
        const rows = document.querySelectorAll('.result-table-list tbody tr, #gridTable tbody tr');
        const results = [];
        for (const row of rows) {
          // CNKI table columns: checkbox | seq | title | authors | journal | date | source_db
          const tds = row.querySelectorAll('td');
          if (tds.length < 5) continue;

          // Find the title — it's in td.name or the td with an <a> linking to article
          const nameCell = row.querySelector('td.name') || tds[2];
          const titleEl = nameCell?.querySelector('a');
          const title = normalize(titleEl?.textContent).replace(/免费$/, '');
          if (!title) continue;

          let url = titleEl?.getAttribute('href') || '';
          if (url && !url.startsWith('http')) url = 'https://oversea.cnki.net' + url;

          // Authors and journal: find by class or positional
          const authorCell = row.querySelector('td.author') || tds[3];
          const journalCell = row.querySelector('td.source') || tds[4];
          const dateCell = row.querySelector('td.date') || tds[5];

          const authors = normalize(authorCell?.textContent);
          const journal = normalize(journalCell?.textContent);
          const date = normalize(dateCell?.textContent);

          results.push({ rank: results.length + 1, title, authors, journal, date, url });
          if (results.length >= ${limit}) break;
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
