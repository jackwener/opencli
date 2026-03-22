import { cli, Strategy } from '../../registry.js';

cli({
  site: 'baidu-scholar',
  name: 'search',
  description: '百度学术搜索',
  domain: 'xueshu.baidu.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 20)' },
  ],
  columns: ['rank', 'title', 'authors', 'journal', 'year', 'cited', 'url'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    const query = encodeURIComponent(kwargs.query);
    await page.goto(`https://xueshu.baidu.com/s?wd=${query}&pn=0&tn=SE_baiduxueshu_c1gjeupa`);
    await page.wait(5);
    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        for (let i = 0; i < 20; i++) {
          if (document.querySelectorAll('.result').length > 0) break;
          await new Promise(r => setTimeout(r, 500));
        }
        const results = [];
        for (const el of document.querySelectorAll('.result')) {
          const titleEl = el.querySelector('h3 a, .paper-title a, .t a');
          const title = normalize(titleEl?.textContent);
          if (!title) continue;
          let url = titleEl?.getAttribute('href') || '';
          if (url && !url.startsWith('http')) url = 'https://xueshu.baidu.com' + url;
          const infoEl = el.querySelector('.paper-info');
          const authorEls = infoEl?.querySelectorAll('span.authors, span') || [];
          let authors = '', journal = '', year = '', cited = '0';
          const infoText = normalize(infoEl?.textContent);
          const spans = infoEl ? Array.from(infoEl.querySelectorAll('span')) : [];
          const authParts = [];
          for (const sp of spans) {
            const t = normalize(sp.textContent);
            if (!t || t === '，' || t === ',') continue;
            if (t.startsWith('《')) { journal = t.replace(/[《》]/g, ''); continue; }
            if (t.match(/^被引量[：:]/)) { cited = t.match(/(\\d+)/)?.[1] || '0'; continue; }
            if (t.match(/^-\\s*(\\d{4})/)) { year = t.match(/(\\d{4})/)?.[1] || ''; continue; }
            if (t.match(/^\\d{4}年?$/)) { year = t.match(/(\\d{4})/)?.[1] || ''; continue; }
            if (!journal && !t.match(/^被引/) && !t.match(/^-/)) authParts.push(t);
          }
          authors = authParts.join(', ').slice(0, 80);
          if (!year) { const m = infoText.match(/(19|20)\\d{2}/); year = m?.[0] || ''; }
          if (!cited || cited === '0') { const m = infoText.match(/被引量[：:]\\s*(\\d+)/); cited = m?.[1] || '0'; }
          results.push({ rank: results.length + 1, title, authors, journal, year, cited, url });
          if (results.length >= ${limit}) break;
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
