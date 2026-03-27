import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { AuthRequiredError, EmptyResultError, ArgumentError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';

/**
 * band post — Export the full content of a single Band post, including all comments.
 *
 * Uses Strategy.INTERCEPT with a broad `band.us` pattern to capture both the
 * batch request (which embeds get_post) and the get_comments request in a single
 * page navigation. Client-side we identify each by their response shape:
 *   - batch response: result_data.batch_result[]
 *   - comments response: result_data.items[] where items have a comment_id field
 *
 * Optionally downloads attached photos with --output <dir>.
 */
cli({
  site: 'band',
  name: 'post',
  description: 'Export full content of a post including comments',
  domain: 'www.band.us',
  strategy: Strategy.INTERCEPT,
  browser: true,
  args: [
    {
      name: 'band_no',
      positional: true,
      required: true,
      type: 'int',
      help: 'Band number',
    },
    {
      name: 'post_no',
      positional: true,
      required: true,
      type: 'int',
      help: 'Post number',
    },
    {
      name: 'output',
      type: 'str',
      default: '',
      help: 'Directory to download attached photos into',
    },
  ],
  columns: ['type', 'author', 'date', 'text'],

  func: async (page, kwargs) => {
    const bandNo = Number(kwargs.band_no);
    const postNo = Number(kwargs.post_no);
    const outputDir = kwargs.output as string;

    if (!bandNo) throw new ArgumentError('band_no', 'Band number is required');
    if (!postNo) throw new ArgumentError('post_no', 'Post number is required');

    await page.goto('https://www.band.us/');
    await page.wait(2); // wait for React hydration and cookie settlement

    const isLoggedIn = await page.evaluate(`() => document.cookie.includes('band_session')`);
    if (!isLoggedIn) throw new AuthRequiredError('band.us', 'Not logged in to Band');

    // Use a broad pattern to capture both the batch (post body) and get_comments
    // in a single navigation, since they fire concurrently on the same page load.
    await page.installInterceptor('band.us');

    // SPA navigation: PopStateEvent signals React Router to render the post page,
    // which triggers both batch (containing get_post) and get_comments XHR calls.
    await page.evaluate(`() => {
      window.history.pushState({}, '', '/band/${bandNo}/post/${postNo}');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    }`);
    await page.wait(5); // allow time for both XHR round-trips to complete

    const requests = await page.getInterceptedRequests();
    if (requests.length === 0) {
      throw new EmptyResultError('band post', 'No data captured — try again.');
    }

    // Identify the batch response by the presence of batch_result.
    // The batch embeds get_post, get_emotions, etc. as sub-requests.
    const batchReq = (requests as any[]).find(r =>
      Array.isArray(r?.result_data?.batch_result)
    );
    // Identify the comments response by items that have a comment_id field.
    const commentsReq = (requests as any[]).find(r =>
      Array.isArray(r?.result_data?.items) &&
      r.result_data.items.length > 0 &&
      r.result_data.items[0]?.comment_id !== undefined
    );

    const postData = batchReq?.result_data?.batch_result?.[0]?.result_data?.post;
    if (!postData) {
      throw new EmptyResultError('band post', 'Post not found or not accessible');
    }

    const stripBandTags = (s: string) => s.replace(/<\/?band:[^>]+>/g, '');
    const fmtDate = (ms: number) =>
      new Date(ms).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });

    // Extract photo URLs from attachment.photo (object keyed by photo_no).
    const photos: string[] = Object.values(postData.attachment?.photo ?? {})
      .map((p: any) => p.photo_url)
      .filter(Boolean);

    // Download photos if --output was specified.
    if (outputDir && photos.length > 0) {
      fs.mkdirSync(outputDir, { recursive: true });
      await Promise.all(
        photos.map((url, i) =>
          new Promise<void>((resolve, reject) => {
            const ext = path.extname(new URL(url).pathname) || '.jpg';
            const dest = path.join(outputDir, `photo_${i + 1}${ext}`);
            const file = fs.createWriteStream(dest);
            const get = url.startsWith('https') ? https.get : http.get;
            get(url, res => {
              res.pipe(file);
              file.on('finish', () => { file.close(); resolve(); });
            }).on('error', reject);
          })
        )
      );
    }

    // Build output rows: post header first, then one row per comment.
    const rows: Record<string, string>[] = [];

    rows.push({
      type: 'post',
      author: postData.author?.name ?? '',
      date: postData.created_at ? fmtDate(postData.created_at) : '',
      // Include photo URLs in the text if not downloading, so they are visible.
      text: [
        stripBandTags(postData.content ?? ''),
        ...(outputDir ? [] : photos.map((u, i) => `[photo${i + 1}] ${u}`)),
      ].filter(Boolean).join('\n'),
    });

    const commentItems: any[] = commentsReq?.result_data?.items ?? [];
    for (const c of commentItems) {
      rows.push({
        type: 'comment',
        author: c.author?.name ?? '',
        date: c.created_at ? fmtDate(c.created_at) : '',
        text: stripBandTags(c.body ?? ''),
      });
    }

    return rows;
  },
});
