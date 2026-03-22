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
    await page.goto(`https://item.taobao.com/item.htm?id=${kwargs.id}`);
    await page.wait(6);
    await page.autoScroll({ times: 3, delayMs: 2000 });

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();

        // Wait for reviews to load
        for (let i = 0; i < 30; i++) {
          if (document.querySelectorAll('[class*="comment--"], [class*="Comment--"], [class*="review--"], .rate-grid').length > 0) break;
          await new Promise(r => setTimeout(r, 500));
        }

        const results = [];

        // Strategy 1: Find comment elements by class prefix
        const commentEls = document.querySelectorAll('[class*="comment--"], [class*="Comment--"], [class*="rateContent--"]');
        if (commentEls.length > 0) {
          for (const el of commentEls) {
            const content = normalize(el.textContent);
            if (content.length < 5 || content.length > 500) continue;
            // Find user name nearby
            const parent = el.closest('[class*="rateItem--"], [class*="item--"]') || el.parentElement?.parentElement;
            const userEl = parent?.querySelector('[class*="userName--"], [class*="user--"]');
            const user = userEl ? normalize(userEl.textContent) : '';
            const dateEl = parent?.querySelector('[class*="date--"], [class*="time--"]');
            const date = dateEl ? normalize(dateEl.textContent) : '';
            const specEl = parent?.querySelector('[class*="sku--"], [class*="spec--"]');
            const spec = specEl ? normalize(specEl.textContent) : '';

            results.push({ rank: results.length + 1, user, content: content.slice(0, 150), date, spec });
            if (results.length >= ${limit}) break;
          }
        }

        // Strategy 2: parse from page text if DOM extraction failed
        if (results.length === 0) {
          const text = document.body?.innerText || '';
          // Look for review section
          const reviewIdx = text.search(/评价|评论|买家秀/);
          if (reviewIdx > 0) {
            const section = text.substring(reviewIdx, reviewIdx + 3000);
            const lines = section.split('\\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 300);
            for (const line of lines) {
              // Skip headers and navigation
              if (line.match(/^(评价|评论|买家秀|全部|好评|中评|差评|有图|追评)/)) continue;
              if (line.match(/^\\d+$/)) continue;
              results.push({ rank: results.length + 1, user: '', content: line.slice(0, 150), date: '', spec: '' });
              if (results.length >= ${limit}) break;
            }
          }
        }

        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
