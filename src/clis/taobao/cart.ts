import { cli, Strategy } from '../../registry.js';

cli({
  site: 'taobao',
  name: 'cart',
  description: '查看淘宝购物车',
  domain: 'cart.taobao.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'limit', type: 'int', default: 20, help: '返回数量 (max 50)' },
  ],
  columns: ['index', 'title', 'price', 'spec', 'shop'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 20, 50);
    await page.goto('https://www.taobao.com');
    await page.wait(2);
    await page.evaluate(`location.href = 'https://cart.taobao.com/cart.htm'`);
    await page.wait(6);
    await page.autoScroll({ times: 3, delayMs: 1500 });

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        const text = document.body?.innerText || '';

        if (text.length < 500 || text.includes('请登录')) {
          return [{index:0, title:'[需要登录] 请在自动化窗口中登录淘宝', price:'', spec:'', shop:''}];
        }

        // Parse cart from text: each item ends with "移入收藏 删除"
        // Split text by "移入收藏" delimiter
        const sections = text.split(/移入收藏/);
        const results = [];

        for (const section of sections) {
          const lines = section.split('\\n').map(l => l.trim()).filter(Boolean);
          if (lines.length < 3) continue;

          // Find the product title: longest line that looks like a product name
          let title = '';
          let titleIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (l.length > 15 && l.length < 200 && !l.match(/^(删除|全选|全部商品|合计|结算|找同款|退货|￥|¥|\\d+$|颜色|尺码|规格|套餐|主板|运行)/)) {
              if (l.length > title.length) {
                title = l;
                titleIdx = i;
              }
            }
          }
          if (!title) continue;

          // Price: find ￥ followed by digits (may be split across lines)
          let price = '';
          for (let i = 0; i < lines.length; i++) {
            if (lines[i] === '￥' || lines[i] === '¥') {
              // Next lines contain the price digits
              let p = '';
              for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                if (lines[j].match(/^[\\d,.]+$/)) { p += lines[j]; }
                else if (lines[j] === '.') { p += '.'; }
                else break;
              }
              if (p) { price = '￥' + p; break; }
            }
          }

          // Spec: lines starting with 颜色/尺码/规格/套餐
          let spec = '';
          for (const l of lines) {
            if (l.match(/^(颜色分类|尺码|规格|套餐|主板|运行)[：:]/)) {
              spec = l.slice(0, 40);
              break;
            }
          }

          // Shop: check the line before title or look for shop patterns
          let shop = '';
          if (titleIdx > 0) {
            const prev = lines[titleIdx - 1];
            if (prev && prev.length > 2 && prev.length < 30 && !prev.match(/^(删除|\\d|￥|¥|券|退|满|超)/)) {
              shop = prev;
            }
          }

          results.push({
            index: results.length + 1,
            title: title.slice(0, 80),
            price,
            spec,
            shop,
          });
          if (results.length >= ${limit}) break;
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
