import { cli, Strategy } from '../../registry.js';

cli({
  site: 'gov-law',
  name: 'search',
  description: '国家法律法规数据库搜索',
  domain: 'flk.npc.gov.cn',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 20)' },
  ],
  columns: ['rank', 'title', 'status', 'publish_date', 'type', 'department'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    await page.goto('https://flk.npc.gov.cn/index.html');
    await page.wait(4);

    // Set search input value via Vue reactivity, then trigger search via Vue Router
    const query = JSON.stringify(kwargs.query);
    await page.evaluate(`
      (async () => {
        // Set input value to trigger Vue's v-model binding
        const input = document.querySelector('.el-input__inner');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, ${query});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Wait for Vue to process the input
        await new Promise(r => setTimeout(r, 500));
        // Navigate via Vue Router with searchWord
        const app = document.querySelector('#app');
        const router = app?.__vue_app__?.config?.globalProperties?.$router;
        if (router) {
          await router.push({path: '/search', query: {searchWord: ${query}}});
        }
        // After navigation, set the search input again on the search page
        await new Promise(r => setTimeout(r, 1000));
        const searchInput = document.querySelector('.el-input__inner');
        if (searchInput && !searchInput.value) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(searchInput, ${query});
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 300));
          // Trigger Enter key to execute search
          searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        }
      })()
    `);
    await page.wait(5);

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        for (let i = 0; i < 40; i++) {
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
