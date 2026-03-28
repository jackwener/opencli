import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { AuthRequiredError, EmptyResultError, ArgumentError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';

/**
 * band post — Export full content of a Band post: body, comments, and optional photo download.
 *
 * Navigates directly to the post URL and extracts everything from the DOM.
 * No XHR interception needed — Band renders the full post for logged-in users.
 *
 * Output rows:
 *   type=post    → the post itself (author, date, body text)
 *   type=comment → top-level comment
 *   type=reply   → reply to a comment (nested under its parent)
 *
 * Photo thumbnail URLs carry a ?type=sNNN suffix; stripping it yields full-res.
 */
cli({
  site: 'band',
  name: 'post',
  description: 'Export full content of a post including comments',
  domain: 'www.band.us',
  strategy: Strategy.COOKIE,
  navigateBefore: false,
  browser: true,
  args: [
    { name: 'band_no', positional: true, required: true, type: 'int', help: 'Band number' },
    { name: 'post_no', positional: true, required: true, type: 'int', help: 'Post number' },
    { name: 'output', type: 'str', default: '', help: 'Directory to save attached photos' },
    { name: 'comments', type: 'bool', default: true, help: 'Include comments (default: true)' },
  ],
  columns: ['type', 'author', 'date', 'text'],

  func: async (page, kwargs) => {
    const bandNo = Number(kwargs.band_no);
    const postNo = Number(kwargs.post_no);
    const outputDir = kwargs.output as string;
    const withComments = kwargs.comments as boolean;

    if (!bandNo) throw new ArgumentError('band_no', 'Band number is required');
    if (!postNo) throw new ArgumentError('post_no', 'Post number is required');

    await page.goto(`https://www.band.us/band/${bandNo}/post/${postNo}`);

    const isLoggedIn = await page.evaluate(`() => document.cookie.includes('band_session')`);
    if (!isLoggedIn) throw new AuthRequiredError('band.us', 'Not logged in to Band');

    const data: {
      author: string;
      date: string;
      text: string;
      photos: string[];
      comments: { depth: number; author: string; date: string; text: string }[];
    } = await page.evaluate(`
      (async () => {
        const withComments = ${withComments};
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
        // Band embeds <band:mention>, <band:sticker>, etc. in content — strip to plain text.
        const stripTags = s => s.replace(/<\\/?band:[^>]+>/g, '');

        // Wait up to 9 s for the post content to render (poll for the author link,
        // which appears after React hydration fills the post header).
        for (let i = 0; i < 30; i++) {
          if (document.querySelector('._postWrapper a.text')) break;
          await sleep(300);
        }

        const postCard = document.querySelector('._postWrapper');
        const commentSection = postCard?.querySelector('.dPostCommentMainView');

        // Author and date live in the post header, above the comment section.
        // Exclude any matches inside the comment section to avoid picking up comment authors.
        let author = '', date = '';
        for (const el of (postCard?.querySelectorAll('a.text') || [])) {
          if (!commentSection?.contains(el)) { author = norm(el.textContent); break; }
        }
        for (const el of (postCard?.querySelectorAll('time.time') || [])) {
          if (!commentSection?.contains(el)) { date = norm(el.textContent); break; }
        }

        const bodyEl = postCard?.querySelector('.postText._postText');
        const text = bodyEl ? stripTags(norm(bodyEl.innerText || bodyEl.textContent)) : '';

        // Photo thumbnails have a ?type=sNNN query param; strip it for full-res URL.
        const photos = Array.from(postCard?.querySelectorAll('img._imgRecentPhoto, img._imgPhoto') || [])
          .map(img => {
            try { const u = new URL(img.getAttribute('src') || ''); return u.origin + u.pathname; }
            catch { return ''; }
          })
          .filter(Boolean);

        if (!withComments) return { author, date, text, photos, comments: [] };

        // Wait up to 6 s for comments to appear.
        for (let i = 0; i < 20; i++) {
          if (postCard?.querySelector('.sCommentList._heightDetectAreaForComment .cComment')) break;
          await sleep(300);
        }

        // Recursively collect comments and their replies.
        // Replies live in .sReplyList > .sCommentList, not in ._replyRegion.
        function extractComments(container, depth) {
          const results = [];
          for (const el of container.querySelectorAll(':scope > .cComment')) {
            results.push({
              depth,
              author: norm(el.querySelector('strong.name')?.textContent),
              date:   norm(el.querySelector('time.time')?.textContent),
              text:   stripTags(norm(el.querySelector('p.txt._commentContent')?.innerText || '')),
            });
            const replyList = el.querySelector('.sReplyList .sCommentList._heightDetectAreaForComment');
            if (replyList) results.push(...extractComments(replyList, depth + 1));
          }
          return results;
        }

        const commentList = postCard?.querySelector('.sCommentList._heightDetectAreaForComment');
        const comments = commentList ? extractComments(commentList, 0) : [];

        return { author, date, text, photos, comments };
      })()
    `);

    if (!data?.text && !data?.comments?.length) {
      throw new EmptyResultError('band post', 'Post not found or not accessible');
    }

    // Download photos when --output is specified.
    const photos: string[] = data.photos ?? [];
    if (outputDir && photos.length > 0) {
      fs.mkdirSync(outputDir, { recursive: true });
      await Promise.all(photos.map((url, i) =>
        new Promise<void>((resolve, reject) => {
          const ext = path.extname(new URL(url).pathname) || '.jpg';
          const dest = path.join(outputDir, `photo_${i + 1}${ext}`);
          const file = fs.createWriteStream(dest);
          (url.startsWith('https') ? https : http).get(url, res => {
            if (res.statusCode && res.statusCode >= 300) {
              file.close();
              fs.unlink(dest, () => {});
              reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
              return;
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
        })
      ));
    }

    const rows: Record<string, string>[] = [];

    // Post row — append photo URLs inline when not downloading to disk.
    rows.push({
      type: 'post',
      author: data.author ?? '',
      date: data.date ?? '',
      text: [
        data.text ?? '',
        ...(outputDir ? [] : photos.map((u, i) => `[photo${i + 1}] ${u}`)),
      ].filter(Boolean).join('\n'),
    });

    // Comment rows — depth=0 → type 'comment', depth≥1 → type 'reply'.
    for (const c of data.comments ?? []) {
      rows.push({
        type: c.depth === 0 ? 'comment' : 'reply',
        author: c.author ?? '',
        date: c.date ?? '',
        text: c.depth > 0 ? '  └ ' + (c.text ?? '') : (c.text ?? ''),
      });
    }

    return rows;
  },
});
