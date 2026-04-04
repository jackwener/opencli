import { cli, Strategy } from '../../registry.js';

cli({
  site: 'lenovo',
  name: 'search',
  description: '搜索联想商城商品',
  domain: 's.lenovo.com.cn',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'keyword', type: 'string', required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回数量' },
  ],
  columns: ['name', 'price', 'origPrice', 'spec', 'id', 'link'],
  func: async (page: any, kwargs: any) => {
    const { keyword, limit } = kwargs;
    await page.goto(`https://s.lenovo.com.cn/search/?key=${encodeURIComponent(keyword)}`, { waitUntil: 'networkidle' });

    const items = await page.evaluate(`
      (function() {
        var results = [];
        var els = document.querySelectorAll('.productDetail li[latag]');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var nameA = el.querySelector('.search_name a');
          if (!nameA) continue;
          results.push({
            name: nameA.textContent.trim(),
            spec: (el.querySelector('.search_mes a') || {}).textContent?.trim() || '',
            price: (el.querySelector('.s_price') || {}).textContent?.trim() || '',
            origPrice: (el.querySelector('.search_delineatePrice') || {}).textContent?.trim() || '',
            link: nameA.href || '',
            id: (el.getAttribute('latag') || '').match(/\\d{7}/)?.[0] || ''
          });
          if (results.length >= ${limit}) break;
        }
        return results;
      })()
    `);

    return items;
  },
});
