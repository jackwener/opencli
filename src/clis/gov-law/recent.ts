import { cli, Strategy } from '../../registry.js';

cli({
  site: 'gov-law',
  name: 'recent',
  description: '最新法律法规',
  domain: 'flk.npc.gov.cn',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 20)' },
  ],
  columns: ['rank', 'title', 'status', 'publish_date', 'type', 'department'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    // Navigate to index, then use Vue Router to search page (shows all, sorted by date)
    await page.goto('https://flk.npc.gov.cn/index.html');
    await page.wait(4);

    await page.evaluate(`
      (async () => {
        const app = document.querySelector('#app');
        const router = app?.__vue_app__?.config?.globalProperties?.$router;
        if (router) {
          await router.push({path: '/search', query: {}});
        }
      })()
    `);
    await page.wait(4);

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        for (let i = 0; i < 30; i++) {
          if (document.querySelectorAll('.result-item').length > 0) break;
          await new Promise(r => setTimeout(r, 500));
        }
        const results = [];
        const items = document.querySelectorAll('.result-item');
        for (const el of items) {
          const title = normalize(el.querySelector('.title-content')?.textContent);
          if (!title) continue;
          const statusEl = el.querySelector('[class*="status"]');
          const status = normalize(statusEl?.textContent);
          const pubDate = normalize(el.querySelector('.publish-time')?.textContent).replace(/^公布日期[：:]\\s*/, '');
          const type = normalize(el.querySelector('.type')?.textContent);
          const department = normalize(el.querySelector('.department')?.textContent);
          results.push({ rank: results.length + 1, title, status, publish_date: pubDate, type, department });
          if (results.length >= ${limit}) break;
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
