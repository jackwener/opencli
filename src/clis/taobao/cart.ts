import { cli, Strategy } from '../../registry.js';

cli({
  site: 'taobao',
  name: 'cart',
  description: '查看淘宝购物车',
  domain: 'cart.taobao.com',
  strategy: Strategy.COOKIE,
  args: [],
  columns: ['index', 'title', 'price', 'quantity', 'shop', 'url'],
  navigateBefore: false,
  func: async (page) => {
    await page.goto('https://cart.taobao.com/cart.htm');
    await page.wait(6);
    await page.autoScroll({ times: 1, delayMs: 1000 });

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();

        for (let i = 0; i < 20; i++) {
          if (document.body?.innerText?.length > 500) break;
          await new Promise(r => setTimeout(r, 500));
        }

        const results = [];

        // Strategy 1: Find cart items by class prefix patterns
        const items = document.querySelectorAll('[class*="order--"], [class*="item--"], [class*="cartItem--"]');
        const seen = new Set();
        for (const item of items) {
          const titleEl = item.querySelector('[class*="itemTitle--"], [class*="title--"] a, a[href*="item.htm"]');
          const title = titleEl ? normalize(titleEl.textContent) : '';
          if (!title || title.length < 3 || seen.has(title)) continue;
          seen.add(title);

          const priceEl = item.querySelector('[class*="price--"], [class*="Price--"]');
          const price = priceEl ? normalize(priceEl.textContent) : '';

          const qtyEl = item.querySelector('[class*="quantity--"] input, [class*="amount--"] input, input[type="text"]');
          const quantity = qtyEl ? qtyEl.value || '1' : '1';

          const shopEl = item.querySelector('[class*="shopName--"], [class*="shop--"] a');
          const shop = shopEl ? normalize(shopEl.textContent) : '';

          const linkEl = item.querySelector('a[href*="item.htm"]');
          let url = linkEl ? linkEl.getAttribute('href') || '' : '';
          if (url.startsWith('//')) url = 'https:' + url;

          results.push({
            index: results.length + 1,
            title: title.slice(0, 80),
            price,
            quantity,
            shop,
            url: url.split('&')[0],
          });
        }

        // Strategy 2: parse from text if DOM failed
        if (results.length === 0) {
          const text = document.body?.innerText || '';
          if (text.includes('购物车') && text.length > 200) {
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.length > 10 && line.length < 150 && !line.match(/^(购物车|全选|结算|商品|合计|¥)/) && lines[i+1]?.includes('¥')) {
                results.push({
                  index: results.length + 1,
                  title: line.slice(0, 80),
                  price: (lines[i+1].match(/¥[\\d.]+/) || [''])[0],
                  quantity: '1',
                  shop: '',
                  url: '',
                });
              }
            }
          }
        }

        if (results.length === 0 && document.body?.innerText?.includes('登录')) {
          return [{index:0, title:'[需要登录] 请在自动化窗口中登录淘宝', price:'', quantity:'', shop:'', url:''}];
        }

        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
