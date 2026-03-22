import { cli, Strategy } from '../../registry.js';

cli({
  site: 'taobao',
  name: 'reviews',
  description: '淘宝商品评价',
  domain: 'item.taobao.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'id', positional: true, required: true, help: '商品 ID' },
    { name: 'limit', type: 'int', default: 10, help: '返回评价数量 (max 20)' },
  ],
  columns: ['rank', 'user', 'content', 'date', 'spec'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    // Navigate to product page first (to get cookies/session)
    await page.goto('https://www.taobao.com');
    await page.wait(2);
    await page.evaluate(`location.href = 'https://item.taobao.com/item.htm?id=${kwargs.id}'`);
    await page.wait(5);

    // Try to fetch reviews via the rate API
    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();

        // Try MTOP rate list API
        try {
          const resp = await fetch(
            'https://rate.tmall.com/list_detail_rate.htm?itemId=${kwargs.id}&sellerId=&order=3&currentPage=1&pageSize=${limit}&callback=',
            { credentials: 'include' }
          );
          let text = await resp.text();
          // Remove JSONP wrapper if any
          text = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
          const json = JSON.parse(text);
          const list = json?.rateDetail?.rateList || json?.rateList || [];
          if (list.length > 0) {
            return list.slice(0, ${limit}).map((item, i) => ({
              rank: i + 1,
              user: (item.displayUserNick || item.userNick || '').slice(0, 15),
              content: normalize(item.rateContent || '').slice(0, 150),
              date: item.rateDate || '',
              spec: normalize(item.auctionSku || '').slice(0, 40),
            }));
          }
        } catch {}

        // Try alternative API endpoint
        try {
          const resp2 = await fetch(
            'https://rate.taobao.com/feedRateList.htm?auctionNumId=${kwargs.id}&currentPageNum=1&pageSize=${limit}&orderType=feedbackdate&callback=',
            { credentials: 'include' }
          );
          let text2 = await resp2.text();
          text2 = text2.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
          const json2 = JSON.parse(text2);
          const comments = json2?.comments || [];
          if (comments.length > 0) {
            return comments.slice(0, ${limit}).map((item, i) => ({
              rank: i + 1,
              user: (item.user?.nick || '').slice(0, 15),
              content: normalize(item.content || '').slice(0, 150),
              date: item.date || '',
              spec: normalize(item.auction?.sku || '').slice(0, 40),
            }));
          }
        } catch {}

        return [];
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
