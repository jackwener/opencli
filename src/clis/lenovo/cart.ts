import { cli, Strategy } from '../../registry.js';

cli({
  site: 'lenovo',
  name: 'cart',
  description: '将联想商品加入购物车',
  domain: 'tk.lenovo.com.cn',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'id', type: 'string', required: true, help: '商品ID，如 1036411' },
    { name: 'qty', type: 'int', default: 1, help: '购买数量' },
  ],
  columns: ['status', 'name', 'price', 'qty'],
  func: async (page: any, kwargs: any) => {
    const { id, qty } = kwargs;
    await page.goto(`https://tk.lenovo.com.cn/product/${id}.html`, { waitUntil: 'networkidle' });

    const info = await page.evaluate(`
      (function() {
        var title = document.title.split('_')[0].trim();
        var priceEl = document.querySelector('.estimatedAvailabilityBuyNum');
        var price = priceEl ? priceEl.textContent.trim() : '';
        return { name: title, price: price };
      })()
    `);

    // 设置数量
    if (qty > 1) {
      await page.evaluate(`
        (function() {
          var input = document.querySelector('#buy_number');
          if (input) { input.value = '${qty}'; input.dispatchEvent(new Event('change')); }
        })()
      `);
    }

    // 点击加入购物车
    const result = await page.evaluate(`
      (function() {
        var btn = document.querySelector('#jrgwc');
        if (btn) { btn.click(); return 'clicked'; }
        return 'not_found';
      })()
    `);

    if (result === 'clicked') {
      return [{ status: '已加入购物车', name: info.name, price: info.price, qty }];
    }
    return [{ status: '加购失败（按钮未找到）', name: info.name, price: info.price, qty }];
  },
});
