import { cli, Strategy } from '../../registry.js';

cli({
  site: 'jd',
  name: 'detail',
  description: '京东商品详情',
  domain: 'item.jd.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'sku', positional: true, required: true, help: '商品 SKU ID' },
  ],
  columns: ['field', 'value'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    await page.goto(`https://item.jd.com/${kwargs.sku}.html`);
    await page.wait(5);

    const data = await page.evaluate(`
      (() => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        const text = document.body?.innerText || '';

        // Title from <title> tag
        const titleMatch = document.title.match(/^【[^】]*】(.+?)【/);
        const title = titleMatch ? titleMatch[1].trim() : normalize(document.title.split('【')[0]);

        // Price
        const priceMatch = text.match(/¥([\\d,.]+)/);
        const price = priceMatch ? '¥' + priceMatch[1] : '';

        // Rating summary - find "超XX%买家赞不绝口" or similar
        const ratingMatch = text.match(/(超\\d+%[^\\n]{2,20})/);
        const rating = ratingMatch ? ratingMatch[1] : '';

        // Total reviews
        const reviewMatch = text.match(/买家评价\\(([\\d万+]+)\\)/);
        const reviews = reviewMatch ? reviewMatch[1] : '';

        // Shop
        const shopMatch = text.match(/(\\S{2,15}(?:京东自营旗舰店|旗舰店|专卖店|自营店))/);
        const shop = shopMatch ? shopMatch[1] : '';

        // Tags - extract "触感超舒适 163" patterns
        const tagPattern = /([\u4e00-\u9fa5]{2,8})\\s+(\\d+)/g;
        const tags = [];
        let m;
        const tagSection = text.substring(text.indexOf('买家评价'), text.indexOf('买家评价') + 500);
        while ((m = tagPattern.exec(tagSection)) && tags.length < 6) {
          if (parseInt(m[2]) > 1) tags.push(m[1] + '(' + m[2] + ')');
        }

        const results = [
          { field: '商品名称', value: title },
          { field: '价格', value: price },
          { field: 'SKU', value: '${kwargs.sku}' },
          { field: '店铺', value: shop },
          { field: '评价数量', value: reviews },
          { field: '好评率', value: rating },
          { field: '评价标签', value: tags.join(' | ') },
          { field: '链接', value: location.href },
        ];
        return results.filter(r => r.value);
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
