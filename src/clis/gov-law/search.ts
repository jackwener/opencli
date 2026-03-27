import { cli, Strategy } from '../../registry.js';
import { navigateViaVueRouter, extractLawResults } from './shared.js';

cli({
  site: 'gov-law',
  name: 'search',
  description: '国家法律法规数据库搜索',
  domain: 'flk.npc.gov.cn',
  strategy: Strategy.PUBLIC,
  browser: true,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 20)' },
  ],
  columns: ['rank', 'title', 'status', 'publish_date', 'type', 'department'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    await navigateViaVueRouter(page, { searchWord: kwargs.query });

    // Set search input for Vue reactivity
    const query = JSON.stringify(kwargs.query);
    await page.evaluate(`
      (async () => {
        const input = document.querySelector('.el-input__inner');
        if (input && !input.value) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${query});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 300));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        }
      })()
    `);
    await page.wait(3);

    return extractLawResults(page, limit);
  },
});
