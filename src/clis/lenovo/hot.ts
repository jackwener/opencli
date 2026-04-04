import { cli, Strategy } from '../../registry.js';

cli({
  site: 'lenovo',
  name: 'hot',
  description: '联想商城热销/推荐商品',
  domain: 'shop.lenovo.com.cn',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'category', type: 'string', default: '', help: '分类: laptop, desktop, tablet, phone' },
    { name: 'limit', type: 'int', default: 10, help: '返回数量' },
  ],
  columns: ['name', 'price', 'origPrice', 'spec', 'id', 'link'],
  func: async (page: any, kwargs: any) => {
    const { category, limit } = kwargs;
    const catMap: Record<string, string> = { laptop: '笔记本', desktop: '台式机', tablet: '平板', phone: '手机' };
    const keyword = catMap[category] || category || '热销';
    await page.goto(`https://s.lenovo.com.cn/search/?key=${encodeURIComponent(keyword)}&recommendType=0`, { waitUntil: 'networkidle' });

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
