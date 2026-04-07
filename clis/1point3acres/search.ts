import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import type { IPage } from '@jackwener/opencli/types';

type SearchThread = {
  tid?: number | string;
  subject?: string;
  title?: string;
  forum_name?: string;
  forum?: string;
  author?: string;
  username?: string;
  replies?: number | string;
  views?: number | string;
};

type SearchPayload = {
  errno?: number;
  msg?: string;
  threads?: SearchThread[];
};

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

cli({
  site: '1point3acres',
  name: 'search',
  description: '1Point3Acres search (login and search permission required)',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'query', type: 'str', required: true, positional: true, help: 'Search keyword' },
    { name: 'limit', type: 'int', default: 20, help: 'Number of results' },
    { name: 'page', type: 'int', default: 1, help: 'Page number' },
  ],
  columns: ['rank', 'title', 'forum', 'author', 'replies', 'views', 'url'],
  func: async (page: IPage | null, args) => {
    if (!page) throw new CommandExecutionError('Browser session required for 1point3acres search');

    const query = String(args.query ?? '').trim();
    if (!query) throw new CommandExecutionError('1Point3Acres search query cannot be empty');

    const limit = positiveInt(args.limit, 20);
    const pageNum = positiveInt(args.page, 1);

    await page.goto('https://api.1point3acres.com/api/threads');
    const payload = await page.evaluate(`(async () => {
      const url = 'https://api.1point3acres.com/api/search'
        + '?keyword=' + encodeURIComponent(${JSON.stringify(query)})
        + '&page=' + encodeURIComponent(${JSON.stringify(pageNum)})
        + '&ps=' + encodeURIComponent(${JSON.stringify(limit)});
      const res = await fetch(url, { credentials: 'include' });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { errno: -1, msg: text.slice(0, 200) }; }
      return { status: res.status, body };
    })()`) as { status?: number; body?: SearchPayload };

    if (payload.status && payload.status >= 400) {
      throw new CommandExecutionError(`1Point3Acres search failed with HTTP ${payload.status}`);
    }
    if (payload.body?.errno && payload.body.errno !== 0) {
      throw new CommandExecutionError(`1Point3Acres search failed: ${payload.body.msg ?? payload.body.errno}`);
    }

    const threads = payload.body?.threads ?? [];
    if (threads.length === 0) {
      await page.goto(`https://www.1point3acres.com/bbs/search.php?mod=forum&searchsubmit=yes&kw=${encodeURIComponent(query)}`);
      const permissionText = await page.evaluate('() => document.body?.innerText?.slice(0, 5000) || ""') as string;
      if (permissionText.includes('无法进行此操作') || permissionText.includes('所在的用户组')) {
        throw new CommandExecutionError(
          '1Point3Acres search is not available for the current account.',
          'The logged-in account user group does not have permission to use site search yet.',
        );
      }
      throw new EmptyResultError('1point3acres search', `No threads found for query "${query}".`);
    }

    return threads.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      tid: item.tid,
      title: item.subject || item.title || '',
      forum: item.forum_name || item.forum || '',
      author: item.author || item.username || '',
      replies: item.replies ?? '',
      views: item.views ?? '',
      url: item.tid ? `https://www.1point3acres.com/bbs/thread-${item.tid}-1-1.html` : '',
    }));
  },
});
