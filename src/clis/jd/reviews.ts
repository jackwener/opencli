import { cli, Strategy } from '../../registry.js';

cli({
  site: 'jd',
  name: 'reviews',
  description: '京东商品评价',
  domain: 'item.jd.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'sku', positional: true, required: true, help: '商品 SKU ID' },
    { name: 'limit', type: 'int', default: 10, help: '返回评价数量 (max 20)' },
  ],
  columns: ['rank', 'user', 'content', 'date'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 10, 20);
    await page.goto(`https://item.jd.com/${kwargs.sku}.html`);
    await page.wait(5);
    // Scroll to load reviews section
    await page.autoScroll({ times: 2, delayMs: 1500 });

    const data = await page.evaluate(`
      (async () => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        const text = document.body?.innerText || '';

        // JD new version: reviews are inline in page text
        // Pattern: username \\n review_text \\n [date or next username]
        // Find the review section after "买家评价"
        const reviewStart = text.indexOf('买家评价');
        const reviewEnd = text.indexOf('全部评价');
        if (reviewStart < 0) return [];

        const reviewSection = text.substring(reviewStart, reviewEnd > reviewStart ? reviewEnd : reviewStart + 3000);
        const lines = reviewSection.split('\\n').map(l => l.trim()).filter(Boolean);

        const results = [];
        // Skip header lines, look for user-review pairs
        // Users are like "c***4", "3***a", "A***7" or "jd_xxx"
        // JD usernames contain * (masked), like "c***4", "3***a", "jd_xxx"
        const userPattern = /^[a-zA-Z0-9*_]{3,15}$/;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (userPattern.test(line) && line.includes('*') && i + 1 < lines.length) {
            const user = line;
            const content = lines[i + 1];
            // Skip if content looks like a header/tag
            if (content.length < 5 || content.match(/^(全部评价|问大家|查看更多)/)) continue;
            results.push({
              rank: results.length + 1,
              user,
              content: content.slice(0, 150),
              date: '',
            });
            i++; // skip the content line
            if (results.length >= ${limit}) break;
          }
        }
        return results;
      })()
    `);
    return Array.isArray(data) ? data : [];
  },
});
