import { cli, Strategy } from '../../registry.js';

function extractInstructions(payload: any): any[] {
  const roots = [
    payload?.data?.search_by_raw_query?.search_timeline?.timeline,
    payload?.data?.data?.search_by_raw_query?.search_timeline?.timeline,
  ];
  for (const root of roots) {
    if (Array.isArray(root?.instructions)) return root.instructions;
  }
  return [];
}

function collectEntries(instructions: any[]): any[] {
  const entries: any[] = [];
  for (const ins of instructions) {
    if (Array.isArray(ins?.entries)) entries.push(...ins.entries);
    const moduleItems = ins?.entry?.content?.items;
    if (Array.isArray(moduleItems)) {
      for (const item of moduleItems) {
        if (item?.item) entries.push(item.item);
      }
    }
  }
  return entries;
}

function extractTweet(entry: any): any {
  let tweet = entry?.content?.itemContent?.tweet_results?.result;
  if (!tweet) {
    tweet = entry?.itemContent?.tweet_results?.result;
  }
  if (tweet?.__typename === 'TweetWithVisibilityResults' && tweet?.tweet) {
    tweet = tweet.tweet;
  }
  return tweet;
}

async function fallbackFromDom(page: any, limit: number): Promise<any[]> {
  const rows = await page.evaluate(`
    () => {
      const out = [];
      const seen = new Set();
      const parseCount = (text) => {
        if (!text) return 0;
        const n = Number(String(text).replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
      };
      const articles = Array.from(document.querySelectorAll('article'));
      for (const a of articles) {
        const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
        let href = '';
        for (const l of links) {
          const h = l.getAttribute('href') || '';
          if (/\\/status\\/\\d+/.test(h) && !h.includes('/analytics') && !h.includes('/photo/')) {
            href = h.startsWith('http') ? h : \`https://x.com\${h}\`;
            break;
          }
        }
        if (!href || seen.has(href)) continue;
        seen.add(href);

        const idMatch = href.match(/\\/status\\/(\\d+)/);
        const id = idMatch ? idMatch[1] : '';
        const profileLink = Array.from(a.querySelectorAll('[data-testid="User-Name"] a[href^="/"]'))
          .map((el) => el.getAttribute('href') || '')
          .find((v) => /^\\/[^/]+$/.test(v) && v !== '/i');
        const authorFromProfile = profileLink ? profileLink.slice(1) : '';
        const authorFromUrl = (href.match(/^https:\\/\\/x\\.com\\/([^/]+)\\/status\\//) || [])[1] || '';
        const handle = (Array.from(a.querySelectorAll('a span'))
          .find((s) => (s.textContent || '').startsWith('@'))?.textContent || '').trim();
        const text = (a.querySelector('[data-testid="tweetText"]')?.innerText || '').trim();
        const likesText = (a.querySelector('[data-testid="like"]')?.innerText || '').trim();
        const viewsText = (a.querySelector('[href$="/analytics"]')?.innerText || '').trim();
        out.push({
          id,
          author: authorFromProfile || authorFromUrl || (handle ? handle.replace(/^@/, '') : 'unknown'),
          text,
          likes: parseCount(likesText),
          views: viewsText || '0',
          url: href,
        });
      }
      return out;
    }
  `);
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

cli({
  site: 'twitter',
  name: 'search',
  description: 'Search Twitter/X for tweets',
  domain: 'x.com',
  strategy: Strategy.INTERCEPT, // Use intercept strategy
  browser: true,
  args: [
    { name: 'query', type: 'string', required: true },
    { name: 'limit', type: 'int', default: 15 },
  ],
  columns: ['id', 'author', 'text', 'likes', 'views', 'url'],
  func: async (page, kwargs) => {
    // 1. Navigate to search page
    const q = encodeURIComponent(kwargs.query);
    await page.goto(`https://x.com/search?q=${q}&f=top`);
    await page.wait(1);

    // 2. Intercept subsequent SearchTimeline requests.
    await page.installInterceptor('SearchTimeline');

    // 3. Explicitly fail on login redirect (previously returned [] silently).
    const pathname = await page.evaluate('() => window.location.pathname');
    if (pathname === '/i/flow/login') {
      throw new Error('Twitter search requires a logged-in X session in the connected browser');
    }

    // 4. Trigger API by scrolling.
    await page.autoScroll({ times: 5, delayMs: 2000 });
    
    // 5. Parse intercepted payloads first.
    const requests = await page.getInterceptedRequests();
    if (!requests || requests.length === 0) {
      return fallbackFromDom(page, kwargs.limit);
    }

    const results: any[] = [];
    const seenIds = new Set<string>();
    for (const req of requests) {
      try {
        const instructions = extractInstructions(req);
        if (instructions.length === 0) continue;
        const entries = collectEntries(instructions);
        for (const entry of entries) {
          const tweet = extractTweet(entry);
          if (!tweet?.rest_id || seenIds.has(tweet.rest_id)) continue;
          seenIds.add(tweet.rest_id);

          results.push({
            id: tweet.rest_id,
            author: tweet.core?.user_results?.result?.legacy?.screen_name || 'unknown',
            text: tweet.legacy?.full_text || '',
            likes: tweet.legacy?.favorite_count || 0,
            views: tweet.views?.count || '0',
            url: `https://x.com/i/status/${tweet.rest_id}`
          });
        }
      } catch (e) {
        // ignore parsing errors for individual payloads
      }
    }

    if (results.length === 0) {
      return fallbackFromDom(page, kwargs.limit);
    }
    return results.slice(0, kwargs.limit);
  }
});
