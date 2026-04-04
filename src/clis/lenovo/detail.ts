import { cli, Strategy } from '../../registry.js';

cli({
  site: 'lenovo',
  name: 'detail',
  description: '查看联想商品详情（配置、价格、库存）',
  domain: 'tk.lenovo.com.cn',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'id', type: 'string', required: true, help: '商品ID，如 1036411' },
  ],
  columns: ['name', 'price', 'specs', 'stock', 'link'],
  func: async (page: any, kwargs: any) => {
    const { id } = kwargs;
    // 先尝试 item.lenovo.com.cn，如果404再试 tk.lenovo.com.cn
    await page.goto(`https://item.lenovo.com.cn/product/${id}.html`, { waitUntil: 'networkidle' });

    const detail = await page.evaluate(`
      (function() {
        var title = document.title.split('_')[0].trim();
        var priceEl = document.querySelector('.estimatedAvailabilityBuyNum');
        var price = priceEl ? priceEl.textContent.trim() : '';
        var specEls = document.querySelectorAll('.spec-big');
        var specs = [];
        for (var i = 0; i < specEls.length; i++) specs.push(specEls[i].textContent.trim());
        var stock = document.querySelector('#ljgm') ? '有货' : '无货';
        return [{ name: title, price: price, specs: specs.join(' | '), stock: stock, link: location.href }];
      })()
    `);

    return detail;
  },
});
