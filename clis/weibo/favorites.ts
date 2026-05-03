/**
 * Weibo favorites — fetch the user's weibo favorites from the favorites page.
 * Uses the URL: https://www.weibo.com/u/page/fav/{uid}
 */
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'weibo',
  name: 'favorites',
  description: '我的微博收藏列表',
  domain: 'weibo.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'limit', type: 'int', default: 20, help: '数量（最多50）' },
  ],
  columns: ['author', 'text', 'time', 'source', 'likes', 'comments', 'reposts', 'url'],
  func: async (page, kwargs) => {
    const limit = Math.min(kwargs.limit || 20, 50);

    await page.goto('https://weibo.com');
    await page.wait(2);

    const uid: string = await page.evaluate(`
      (() => {
        const app = document.querySelector('#app')?.__vue_app__;
        const store = app?.config?.globalProperties?.$store;
        const uid = store?.state?.config?.config?.uid;
        return uid ? String(uid) : null;
      })()
    `);

    if (!uid) return [{ error: '无法获取微博 UID，请确认已登录微博' }];

    const favUrl = 'https://www.weibo.com/u/page/fav/' + uid;

    await page.goto(favUrl);
    await page.wait(4);

    for (let i = 0; i < 3; i++) {
      await page.evaluate('() => window.scrollBy(0, 800)');
      await page.wait(1);
    }

    const rawData = await page.evaluate(`
      (() => {
        const scrollers = document.querySelectorAll('.wbpro-scroller-item, .vue-recycle-scroller__item-view');
        const out = [];
        for (const s of scrollers) {
          // Use textContent to preserve newlines, then split by \n
          const bodyEl = s.querySelector('[class*="_body_"]') || s.querySelector('.wbpro-item-body') || s;
          // innerText preserves newlines between block elements (unlike textContent)
          const rawText = bodyEl.innerText || s.innerText || '';

          let postUrl = '';
          const anchors = s.querySelectorAll('a[href]');
          for (const a of anchors) {
            const m = String(a.href).match(/weibo\\.com\\/(\\d+)\\/([a-zA-Z0-9]+)/);
            if (m) { postUrl = 'https://weibo.com/' + m[1] + '/' + m[2]; break; }
          }

          if (rawText.length > 20) out.push({ text: rawText, url: postUrl });
          if (out.length >= ${limit}) break;
        }
        return out;
      })()
    `);

    console.error('[DEBUG] Raw cards:', rawData?.length || 0);

    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [{ error: '未找到收藏内容。请确认收藏页面可访问。' }];
    }

    // Debug: print the first card's text
    if (rawData[0]) {
      const firstLines = rawData[0].text.split('\n');
      console.error('[DEBUG] First card lines:', JSON.stringify(firstLines.slice(0, 10)));
    }

    const items = [];
    for (const card of rawData) {
      const raw = card.text || '';
      const lines = raw.split('\n');

      let author = '', time = '', source = '', content = '';
      let likes = '0', comments = '0', reposts = '0';

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        if (t === '添加') continue;

        // Check time FIRST before numbers
        if (!time && /\d+小时前|\d+分钟前|\d+秒前|昨天|前天|\d{1,2}:\d{2}/.test(t)) {
          time = t; continue;
        }

        // Check source
        if (t.startsWith('来自')) { source = t; continue; }

        // Numbers (likes/comments/reposts) - only after we have content
        if (content) {
          const n = parseInt(t);
          if (!isNaN(n) && n > 0 && n < 1000000 && t === String(n)) {
            if (likes === '0') likes = t;
            else if (comments === '0') comments = t;
            else if (reposts === '0') reposts = t;
            continue;
          }
        }

        // Author: first short text before time/content
        if (!author && t.length < 40) {
          author = t; continue;
        }

        // Content: once we have author, this is content
        if (!content && author) {
          content = t; continue;
        }

        // Continue content
        if (content) {
          content += ' ' + t;
        }
      }

      if (content && author) {
        items.push({
          author,
          text: content.substring(0, 300),
          time,
          source,
          likes, comments, reposts,
          url: card.url || favUrl,
        });
      }
    }

    // Remove duplicates by URL
    const seenUrls = new Set();
    const uniqueItems = items.filter(item => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    });

    console.error('[DEBUG] Parsed items:', uniqueItems.length);
    if (uniqueItems.length > 0) return uniqueItems;
    return [{ error: '解析失败。' }];
  },
});
