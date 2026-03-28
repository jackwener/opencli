import { AuthRequiredError, EmptyResultError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';

/**
 * band posts — List posts from a specific Band.
 *
 * Band.us renders the post list in the DOM for logged-in users, so we navigate
 * directly to the band's post page and extract everything from the DOM — no XHR
 * interception or home-page detour required.
 */
cli({
  site: 'band',
  name: 'posts',
  description: 'List posts from a Band',
  domain: 'www.band.us',
  strategy: Strategy.COOKIE,
  navigateBefore: false,
  browser: true,
  args: [
    {
      name: 'band_no',
      positional: true,
      required: true,
      type: 'int',
      help: 'Band number (get it from: band bands)',
    },
    { name: 'limit', type: 'int', default: 20, help: 'Max results' },
  ],
  columns: ['date', 'author', 'content', 'comments', 'url'],

  func: async (page, kwargs) => {
    const bandNo = Number(kwargs.band_no);
    const limit = Number(kwargs.limit);

    // Navigate directly to the band's post page — no home-page detour needed.
    await page.goto(`https://www.band.us/band/${bandNo}/post`);

    const isLoggedIn = await page.evaluate(`() => document.cookie.includes('band_session')`);
    if (!isLoggedIn) throw new AuthRequiredError('band.us', 'Not logged in to Band');

    // Extract post list from the DOM. Poll until post items appear (React hydration).
    const posts: {
      date: string;
      author: string;
      content: string;
      comments: number;
      url: string;
    }[] = await page.evaluate(`
      (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
        const limit = ${limit};

        // Wait up to 9 s for post items to render.
        for (let i = 0; i < 30; i++) {
          if (document.querySelector('li._postListItem, li[data-post-no], article._post')) break;
          await sleep(300);
        }

        // Band embeds custom <band:mention>, <band:sticker>, etc. tags in content.
        const stripTags = s => s.replace(/<\\/?band:[^>]+>/g, '');

        const results = [];
        const postEls = Array.from(
          document.querySelectorAll('li._postListItem, li[data-post-no], article._post')
        );

        for (const el of postEls) {
          // URL: find the post permalink link.
          const linkEl = el.querySelector('a[href*="/post/"]');
          const href = linkEl?.getAttribute('href') || '';
          const url = href.startsWith('http') ? href : 'https://www.band.us' + href;

          // Author name.
          const author = norm(el.querySelector('.authorName, .uAuthorName, a.text.ellipsis')?.textContent);

          // Date / timestamp.
          const dateEl = el.querySelector('time, .timeText._postDate, .uPostDate');
          const date = norm(dateEl?.textContent || dateEl?.getAttribute('datetime') || '');

          // Post body text (strip Band markup tags, truncate for listing).
          const bodyEl = el.querySelector('.postText._postText, .uPostText');
          const content = bodyEl
            ? stripTags(norm(bodyEl.innerText || bodyEl.textContent)).slice(0, 120)
            : '';

          // Comment count badge.
          const commentEl = el.querySelector('._commentCount, .commentCount, .uCommentCount');
          const comments = commentEl ? parseInt(commentEl.textContent, 10) || 0 : 0;

          if (!url && !content) continue;
          results.push({ date, author, content, comments, url });
          if (results.length >= limit) break;
        }

        return results;
      })()
    `);

    if (!posts || posts.length === 0) {
      throw new EmptyResultError('band posts', 'No posts found in this Band');
    }

    return posts;
  },
});
