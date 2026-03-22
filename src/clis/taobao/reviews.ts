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

    // Navigate to product page first to get session cookies and sellerId
    await page.goto('https://www.taobao.com');
    await page.wait(2);
    await page.evaluate(`location.href = 'https://item.taobao.com/item.htm?id=${kwargs.id}'`);
    await page.wait(6);

    // Extract sellerId from page and call rate API with proper cookies
    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();

        // Get sellerId from page context
        let sellerId = '';
        // Try various sources
        const pageText = document.documentElement.innerHTML || '';
        const sellerMatch = pageText.match(/sellerId['":\\s]+['"]?(\\d+)/) || pageText.match(/userId['":\\s]+['"]?(\\d+)/) || pageText.match(/shopId['":\\s]+['"]?(\\d+)/);
        if (sellerMatch) sellerId = sellerMatch[1];

        // Also try from shopkeeper link
        if (!sellerId) {
          const shopLink = document.querySelector('a[href*="shopId="], a[href*="seller_id="], a[href*="userId="]');
          const href = shopLink?.getAttribute('href') || '';
          const m = href.match(/(?:shopId|seller_id|userId)=(\\d+)/);
          if (m) sellerId = m[1];
        }

        // Call the rate JSONP API
        const url = 'https://rate.tmall.com/list_detail_rate.htm?itemId=${kwargs.id}'
          + (sellerId ? '&sellerId=' + sellerId : '')
          + '&order=3&currentPage=1&append=0&content=1&tagId=&posi=&picture=&groupValue=&needFold=0&_ksTS=' + Date.now();

        // Call rate API via JSONP script injection (avoids CORS)
        try {
          const results = await new Promise((resolve) => {
            const cbName = '_ocli_rate_' + Date.now();
            window[cbName] = (data) => {
              delete window[cbName];
              const list = data?.rateDetail?.rateList || [];
              resolve(list.slice(0, ${limit}).map((item, i) => ({
                rank: i + 1,
                user: (item.displayUserNick || item.userNick || '').slice(0, 15),
                content: normalize(item.rateContent || '').slice(0, 150),
                date: (item.rateDate || '').slice(0, 10),
                spec: normalize(item.auctionSku || '').slice(0, 40),
              })));
            };
            const script = document.createElement('script');
            script.src = url + '&callback=' + cbName;
            script.onerror = () => { delete window[cbName]; resolve([]); };
            document.head.appendChild(script);
            setTimeout(() => { delete window[cbName]; resolve([]); }, 10000);
          });
          if (results.length > 0) return results;
        } catch {}

        // Try taobao rate API as fallback
        try {
          const url2 = 'https://rate.taobao.com/feedRateList.htm?auctionNumId=${kwargs.id}&userNumId=' + sellerId + '&currentPageNum=1&pageSize=${limit}&orderType=feedbackdate&callback=';
          const resp2 = await fetch(url2, { credentials: 'include' });
          let text2 = await resp2.text();
          text2 = text2.replace(/^[^(]*\\(/, '').replace(/\\);?\\s*$/, '');
          const json2 = JSON.parse(text2);
          const comments = json2?.comments || [];
          if (comments.length > 0) {
            return comments.slice(0, ${limit}).map((item, i) => ({
              rank: i + 1,
              user: (item.user?.nick || '').slice(0, 15),
              content: normalize(item.content || '').slice(0, 150),
              date: (item.date || '').slice(0, 10),
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
