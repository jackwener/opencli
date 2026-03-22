import { cli, Strategy } from '../../registry.js';

cli({
  site: 'gov-policy',
  name: 'search',
  description: '中国政府网政策文件搜索',
  domain: 'sousuo.www.gov.cn',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 20)' },
  ],
  columns: ['rank', 'title', 'description', 'date', 'url'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    const query = encodeURIComponent(kwargs.query);
    // dataTypeId=107 is the policy library search
    await page.goto(`https://sousuo.www.gov.cn/sousuo/search.shtml?code=17da70961a7&dataTypeId=107&searchWord=${query}`);
    await page.wait(5);

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        for (let i = 0; i < 30; i++) {
          if (document.querySelectorAll('.basic_result_content .item, .js_basic_result_content .item').length > 0) break;
          await new Promise(r => setTimeout(r, 500));
        }
        const results = [];
        const items = document.querySelectorAll('.basic_result_content .item, .js_basic_result_content .item');
        for (const el of items) {
          const titleEl = el.querySelector('a.title, .title a, a.log-anchor');
          let title = normalize(titleEl?.textContent).replace(/<[^>]+>/g, '');
          if (!title || title.length < 4) continue;
          let url = titleEl?.getAttribute('href') || '';
          if (url && !url.startsWith('http')) url = 'https://www.gov.cn' + url;
          const desc = normalize(el.querySelector('.description')?.textContent).slice(0, 120);
          const dateMatch = (el.textContent || '').match(/(\\d{4}[-./]\\d{1,2}[-./]\\d{1,2})/);
          results.push({ rank: results.length + 1, title, description: desc, date: dateMatch?.[1] || '', url });
          if (results.length >= ${limit}) break;
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
