import { cli, Strategy } from '../../registry.js';

cli({
  site: 'taobao',
  name: 'search',
  description: '淘宝商品搜索',
  domain: 's.taobao.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'sort', default: 'default', choices: ['default', 'sale', 'price'], help: '排序 (default/sale销量/price价格)' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 40)' },
  ],
  columns: ['rank', 'title', 'price', 'sales', 'shop', 'location', 'item_id', 'url'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 40);
    const query = encodeURIComponent(kwargs.query);
    const sortMap: Record<string, string> = { default: '', sale: '&sort=sale-desc', price: '&sort=price-asc' };
    const sortParam = sortMap[kwargs.sort] || '';

    await page.goto('https://www.taobao.com');
    await page.wait(2);
    await page.evaluate(`location.href = 'https://s.taobao.com/search?q=${query}${sortParam}'`);
    await page.wait(8);
    await page.autoScroll({ times: 3, delayMs: 2000 });

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();

        // Check login
        const bodyText = document.body?.innerText || '';
        if (bodyText.length < 1000 && bodyText.includes('请登录')) {
          return [{rank:0, title:'[未登录] 请在自动化窗口中登录淘宝', price:'', sales:'', shop:'', location:'', url:''}];
        }

        // Wait for cards
        for (let i = 0; i < 30; i++) {
          if (document.querySelectorAll('[class*="doubleCard--"]').length > 3) break;
          await new Promise(r => setTimeout(r, 500));
        }

        const cards = document.querySelectorAll('[class*="doubleCard--"]');
        const results = [];
        const seenTitles = new Set();

        for (const card of cards) {
          // Title
          const titleEl = card.querySelector('[class*="title--"]');
          const title = titleEl ? normalize(titleEl.textContent) : '';
          if (!title || title.length < 3 || seenTitles.has(title)) continue;
          seenTitles.add(title);

          // Price: integer + optional decimal
          const intEl = card.querySelector('[class*="priceInt--"]');
          const floatEl = card.querySelector('[class*="priceFloat--"]');
          let price = '';
          if (intEl) {
            price = '¥' + normalize(intEl.textContent) + (floatEl ? normalize(floatEl.textContent) : '');
          }

          // Sales
          const salesEl = card.querySelector('[class*="realSales--"]');
          const sales = salesEl ? normalize(salesEl.textContent) : '';

          // Shop name (strip leading "X年老店" prefix)
          const shopEl = card.querySelector('[class*="shopName--"]');
          let shop = shopEl ? normalize(shopEl.textContent) : '';
          shop = shop.replace(/^\\d+年老店/, '').replace(/^回头客[\\d万]+/, '');

          // Location
          const locEls = card.querySelectorAll('[class*="procity--"]');
          const location = Array.from(locEls).map(el => normalize(el.textContent)).join('');

          // Item ID from data-spm-act-id on parent wrapper
          let itemId = '';
          let wrapper = card.parentElement;
          for (let i = 0; i < 3 && wrapper; i++) {
            const spmId = wrapper.getAttribute('data-spm-act-id');
            if (spmId && /^\\d{10,}$/.test(spmId)) { itemId = spmId; break; }
            wrapper = wrapper.parentElement;
          }

          const url = itemId ? 'https://item.taobao.com/item.htm?id=' + itemId : '';

          results.push({ rank: results.length + 1, title: title.slice(0, 80), price, sales, shop, location, item_id: itemId, url });
          if (results.length >= ${limit}) break;
        }

        if (results.length === 0) {
          return [{rank:0, title:'[无结果] cards=' + cards.length, price:'', sales:'', shop:'', location:'', url: location.href}];
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
