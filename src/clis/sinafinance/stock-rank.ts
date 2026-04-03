/**
 * Sinafinance stock rank
 */

import { cli, Strategy } from '../../registry.js';

cli({
  site: 'sinafinance',
  name: 'stock-rank',
  description: '新浪财经热搜榜',
  domain: 'finance.sina.cn',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'market', type: 'string', default: 'cn', help: 'Market: cn, ft, us,wh,hk' },
  ],
  columns: ['Column', 'Name', 'Symbol', 'Market', 'Price', 'Change', 'Url'],
  func: async (page, _args) => {
    await page.goto(`https://finance.sina.cn/`);
    await page.wait({ selector: '#actionSearch', timeout: 10000 });
    const market = _args.market || 'cn';
    const payload = await page.evaluate(`
      (async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
        const waitForElement = async (selector, timeout = 5000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise(r => setTimeout(r, 100));
          }
          throw new Error('Timeout waiting for '+selector);
        };
        const searchBtn =  document.querySelector('#actionSearch');
        if (searchBtn) {
          searchBtn.dispatchEvent(new Event('tap', { bubbles: true }));
          await wait(3000);
        }
        const marketType = '${market}';
        const tabEl = document.querySelector('[data-type="' + marketType + '"]');
        const marketName = tabEl.textContent;
        if (marketType && marketType !== 'cn') {
            if (tabEl) {
              tabEl.click();
              await wait(2000);
            }
        }
        const results = [];
        const rows = await document.querySelectorAll('#stock-list .j-stock-row');
        rows.forEach(el => {
          const rankEl = el.querySelector('.rank');
          const nameEl = el.querySelector('.j-sname');
          const codeEl = el.querySelector('.stock-code');
          const priceEl = el.querySelector('.j-price');
          const changeEl = el.querySelector('.j-change');
          const openUrl = el.getAttribute('open-url') || '';
          const fullUrl = openUrl ? 'https:' + openUrl + (openUrl.includes('?') ? '&from=opencli' : '?from=opencli') : '';
          results.push({
            Column:rankEl?.textContent || '',
            Name: cleanText(nameEl?.textContent || ''),
            Symbol: cleanText(codeEl?.textContent || ''),
            Market:marketName,
            Price: cleanText(priceEl?.textContent || ''),
            Change: cleanText(changeEl?.textContent || ''),
            Url: fullUrl,
          });
        });
        return results;
      })()
    `);
    if (!Array.isArray(payload)) return [];
    return payload;
  },
});
