import { cli, Strategy } from '../../registry.js';

cli({
  site: 'taobao',
  name: 'add-cart',
  description: '淘宝加入购物车',
  domain: 'item.taobao.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'id', positional: true, required: true, help: '商品 ID' },
  ],
  columns: ['status', 'title', 'price', 'item_id'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const itemId = kwargs.id;
    await page.goto(`https://item.taobao.com/item.htm?id=${itemId}`);
    await page.wait(5);

    // Get product info
    const info = await page.evaluate(`
      (() => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        const titleEl = document.querySelector('[class*="mainTitle--"], [class*="ItemHeader--"], h1');
        const title = titleEl ? normalize(titleEl.textContent) : document.title.split('-')[0].trim();
        const priceEl = document.querySelector('[class*="priceText--"], [class*="Price--"]');
        const price = priceEl ? '¥' + normalize(priceEl.textContent).replace(/[¥￥]/g, '') : '';
        return { title: title.slice(0, 80), price };
      })()
    `);

    // Click add-to-cart button
    await page.evaluate(`
      (() => {
        // Find add-to-cart button by text content
        const buttons = document.querySelectorAll('button, [role="button"], a, div[class*="btn"], span[class*="btn"]');
        for (const btn of buttons) {
          const t = (btn.textContent || '').trim();
          if (t === '加入购物车' || t === '加入 购物车' || t.includes('加入购物车')) {
            btn.click();
            return 'clicked';
          }
        }
        return 'btn_not_found';
      })()
    `);
    await page.wait(3);

    // Check result
    const result = await page.evaluate(`
      (() => {
        const text = document.body?.innerText || '';
        if (text.includes('已加入购物车') || text.includes('商品已成功') || text.includes('去购物车')) {
          return 'success';
        }
        if (text.includes('请选择') || text.includes('请先选择')) {
          return 'need_spec';
        }
        if (text.includes('请登录') || text.includes('login')) {
          return 'login_required';
        }
        return 'unknown';
      })()
    `);

    let status = '? 未知';
    if (result === 'success') status = '✓ 已加入购物车';
    else if (result === 'need_spec') status = '✗ 需要先选择规格（请在浏览器中操作）';
    else if (result === 'login_required') status = '✗ 需要登录';

    return [{
      status,
      title: info?.title || '',
      price: info?.price || '',
      item_id: itemId,
    }];
  },
});
