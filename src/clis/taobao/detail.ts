import { cli, Strategy } from '../../registry.js';

cli({
  site: 'taobao',
  name: 'detail',
  description: '淘宝商品详情',
  domain: 'item.taobao.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'id', positional: true, required: true, help: '商品 ID' },
  ],
  columns: ['field', 'value'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    await page.goto(`https://item.taobao.com/item.htm?id=${kwargs.id}`);
    await page.wait(6);
    await page.autoScroll({ times: 1, delayMs: 1000 });

    const data = await page.evaluate(`
      (() => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        const text = document.body?.innerText || '';
        const results = [];

        // Title
        const titleEl = document.querySelector('[class*="mainTitle--"], [class*="ItemHeader--"], h1, .tb-main-title');
        const title = titleEl ? normalize(titleEl.textContent) : document.title.split('-')[0].trim();
        results.push({ field: '商品名称', value: title.slice(0, 100) });

        // Price: find the main price number
        const priceMatch = text.match(/¥\s*(\d+(?:\.\d{1,2})?)/);
        const price = priceMatch ? '¥' + priceMatch[1] : '';
        if (price) results.push({ field: '价格', value: price });

        // Sales / reviews
        const salesMatch = text.match(/(\\d+万?\\+?)\\s*人付款/) || text.match(/月销\\s*(\\d+万?\\+?)/);
        if (salesMatch) results.push({ field: '销量', value: salesMatch[0] });

        const reviewMatch = text.match(/累计评价\\s*(\\d+万?\\+?)/) || text.match(/(\\d+万?\\+?)\\s*条评价/);
        if (reviewMatch) results.push({ field: '评价数', value: reviewMatch[1] || reviewMatch[0] });

        // Rating
        const ratingMatch = text.match(/(\\d+\\.?\\d*)\\s*分/) || text.match(/描述\\s*(\\d+\\.\\d+)/);
        if (ratingMatch) results.push({ field: '评分', value: ratingMatch[0] });

        // Shop: use class prefix matching, exclude nav links
        const shopEl = document.querySelector('[class*="shopName--"] a, [class*="ShopHeader--"] a, [class*="seller--"] a');
        let shop = shopEl ? normalize(shopEl.textContent) : '';
        if (!shop || shop.length < 2 || shop.includes('免费') || shop.includes('登录')) {
          const shopMatch = text.match(/([\u4e00-\u9fa5A-Za-z]{2,15}(?:旗舰店|专卖店|企业店|专营店))/);
          shop = shopMatch ? shopMatch[1] : '';
        }
        if (shop && shop.length > 1 && shop.length < 30) results.push({ field: '店铺', value: shop });

        // Location
        const locMatch = text.match(/发货地[：:]*\\s*([\u4e00-\u9fa5]{2,10})/);
        if (locMatch) results.push({ field: '发货地', value: locMatch[1] });

        results.push({ field: 'ID', value: '${kwargs.id}' });
        results.push({ field: '链接', value: location.href.split('?')[0] + '?id=${kwargs.id}' });

        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
