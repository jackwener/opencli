import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import type { IPage } from '@jackwener/opencli/types';

type PostRow = {
  floor: number;
  pid: string;
  author: string;
  created_at: string;
  content: string;
};

function requirePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

cli({
  site: '1point3acres',
  name: 'posts',
  description: '1Point3Acres thread posts (login required)',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'tid', type: 'str', required: true, positional: true, help: 'Thread ID' },
    { name: 'limit', type: 'int', default: 20, help: 'Number of posts' },
    { name: 'page', type: 'int', default: 1, help: 'Page number' },
  ],
  columns: ['floor', 'author', 'created_at', 'content'],
  func: async (page: IPage | null, args) => {
    if (!page) throw new CommandExecutionError('Browser session required for 1point3acres posts');

    const tid = String(args.tid ?? '').trim();
    if (!/^\d+$/.test(tid)) {
      throw new CommandExecutionError(`Invalid 1Point3Acres thread ID: ${tid}`);
    }

    const limit = requirePositiveInt(args.limit, 20);
    const pageNum = requirePositiveInt(args.page, 1);
    await page.goto(`https://www.1point3acres.com/bbs/thread-${tid}-${pageNum}-1.html`);

    const result = await page.evaluate(`(() => {
      const limit = ${JSON.stringify(limit)};
      const pageNum = ${JSON.stringify(pageNum)};
      const clean = (value) => String(value || '')
        .replace(/\\s+/g, ' ')
        .replace(/\\bwindow\\.[^\\n]+/g, '')
        .trim();
      const textOf = (root, selector) => {
        const el = root.querySelector(selector);
        return el ? clean(el.textContent) : '';
      };
      const sanitizeAuthor = (value) => clean(value)
        .replace(/^[^\\w\\u4e00-\\u9fff]+\\s*/, '')
        .replace(/\\s*发消息\\s*$/, '')
        .split('|')[0]
        .replace(/\\s+\\d+\\s*(?:秒|分钟|小时|天)前.*$/, '')
        .trim();
      const findAuthor = (post) => {
        const selectors = [
          '.pls .xw1 a',
          '.pls .xw1',
          '.authi a[href*="space-uid"]',
          '.authi a[href*="mod=space"]',
          '.authi a[href*="/next/contact-post/"]',
          '.authi'
        ];
        for (const selector of selectors) {
          const text = textOf(post, selector);
          const author = sanitizeAuthor(text);
          if (author && !/^#?$/.test(author)) return author;
        }
        return '';
      };
      const findCreatedAt = (post) => {
        const authText = textOf(post, '.pti .authi, .authi');
        const match = authText.match(/(\\d+\\s*(?:秒|分钟|小时|天)前|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}[^|\\n]*)/);
        return match ? clean(match[1]) : '';
      };
      const rows = [];
      for (const post of Array.from(document.querySelectorAll('div[id^="post_"]'))) {
        const rawId = post.id || '';
        if (!/^post_\\d+$/.test(rawId)) continue;
        const pid = rawId.slice('post_'.length);
        const contentEl = post.querySelector('#postmessage_' + pid) || post.querySelector('.t_f') || post.querySelector('.pcb');
        const content = contentEl ? clean(contentEl.textContent) : '';
        if (!content) continue;
        rows.push({
          floor: (pageNum - 1) * limit + rows.length + 1,
          pid,
          author: findAuthor(post),
          created_at: findCreatedAt(post),
          content: content.slice(0, 500)
        });
        if (rows.length >= limit) break;
      }
      const permissionText = document.body?.innerText || '';
      return { rows, permissionText: permissionText.slice(0, 5000) };
    })()`) as { rows?: PostRow[]; permissionText?: string };

    if (result.permissionText?.includes('无法进行此操作')) {
      throw new CommandExecutionError(
        '1Point3Acres refused access for this account.',
        'The current 1Point3Acres user group does not have permission to read this thread.',
      );
    }

    if (!result.rows?.length) {
      throw new EmptyResultError('1point3acres posts', 'No posts found. Check the thread ID and account permissions.');
    }

    return result.rows;
  },
});
