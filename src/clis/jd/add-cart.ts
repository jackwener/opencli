import { cli, Strategy } from '../../registry.js';

cli({
  site: 'jd',
  name: 'add-cart',
  description: '京东加入购物车',
  domain: 'item.jd.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'sku', positional: true, required: true, help: '商品 SKU ID' },
    { name: 'num', type: 'int', default: 1, help: '数量' },
  ],
  columns: ['status', 'title', 'price', 'sku'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const sku = kwargs.sku;
    const num = kwargs.num || 1;

    await page.goto(`https://item.jd.com/${sku}.html`);
    await page.wait(4);

    // Get product info
    const info = await page.evaluate(`
      (() => {
        const text = document.body?.innerText || '';
        const titleMatch = document.title.match(/^【[^】]*】(.+?)【/);
        const title = titleMatch ? titleMatch[1].trim() : document.title.split('-')[0].trim();
        const priceMatch = text.match(/¥([\\d,.]+)/);
        const price = priceMatch ? '¥' + priceMatch[1] : '';
        return { title, price };
      })()
    `);

    // Navigate to cart domain and use gate.action to add item
    await page.goto(`https://cart.jd.com/gate.action?pid=${sku}&pcount=${num}&ptype=1`);
    await page.wait(4);

    const result = await page.evaluate(`
      (() => {
        const url = location.href;
        const text = document.body?.innerText || '';
        if (text.includes('已成功加入') || text.includes('商品已成功') || url.includes('addtocart')) {
          return 'success';
        }
        if (text.includes('请登录') || text.includes('login') || url.includes('login')) {
          return 'login_required';
        }
        return 'page:' + url.substring(0, 60) + ' | ' + text.substring(0, 100);
      })()
    `);

    let status = '? 未知';
    if (result === 'success') status = '✓ 已加入购物车';
    else if (result === 'login_required') status = '✗ 需要登录京东';
    else status = '? ' + result;

    return [{
      status,
      title: (info?.title || '').slice(0, 80),
      price: info?.price || '',
      sku,
    }];
  },
});
