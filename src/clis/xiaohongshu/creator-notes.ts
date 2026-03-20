/**
 * Xiaohongshu Creator Note List — per-note metrics from the creator backend.
 *
 * In CDP mode we capture the real creator analytics API response so the list
 * includes stable note ids and detail-page URLs. If that capture is unavailable,
 * we fall back to the older interceptor and DOM parsing paths.
 *
 * Requires: logged into creator.xiaohongshu.com in Chrome.
 */

import { cli, Strategy } from '../../registry.js';

const DATE_LINE_RE = /^发布于 (\d{4}年\d{2}月\d{2}日 \d{2}:\d{2})$/;
const METRIC_LINE_RE = /^\d+$/;
const VISIBILITY_LINE_RE = /可见$/;
const NOTE_ANALYZE_API_PATH = '/api/galaxy/creator/datacenter/note/analyze/list';
const NOTE_DETAIL_PAGE_URL = 'https://creator.xiaohongshu.com/statistics/note-detail';

type CreatorNoteRow = {
  id: string;
  title: string;
  date: string;
  views: number;
  likes: number;
  collects: number;
  comments: number;
  url: string;
};

export type { CreatorNoteRow };

type CreatorAnalyzeApiResponse = {
  error?: string;
  data?: {
    note_infos?: Array<{
      id?: string;
      title?: string;
      post_time?: number;
      read_count?: number;
      like_count?: number;
      fav_count?: number;
      comment_count?: number;
    }>;
    total?: number;
  };
};

const NOTE_ID_HTML_RE = /&quot;noteId&quot;:&quot;([0-9a-f]{24})&quot;/g;

function buildNoteDetailUrl(noteId?: string): string {
  return noteId ? `${NOTE_DETAIL_PAGE_URL}?noteId=${encodeURIComponent(noteId)}` : '';
}

function formatPostTime(ts?: number): string {
  if (!ts) return '';
  const date = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseCreatorNotesText(bodyText: string): CreatorNoteRow[] {
  const lines = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const results: CreatorNoteRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(DATE_LINE_RE);
    if (!dateMatch) continue;

    let titleIndex = i - 1;
    while (titleIndex >= 0 && VISIBILITY_LINE_RE.test(lines[titleIndex])) titleIndex--;
    if (titleIndex < 0) continue;

    const title = lines[titleIndex];
    const metrics: number[] = [];
    let cursor = i + 1;

    while (cursor < lines.length && METRIC_LINE_RE.test(lines[cursor]) && metrics.length < 5) {
      metrics.push(parseInt(lines[cursor], 10));
      cursor++;
    }

    if (metrics.length < 4) continue;

    const key = `${title}@@${dateMatch[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: '',
      title,
      date: dateMatch[1],
      views: metrics[0] ?? 0,
      likes: metrics[1] ?? 0,
      collects: metrics[2] ?? 0,
      comments: metrics[3] ?? 0,
      url: '',
    });

    i = cursor - 1;
  }

  return results;
}

export function parseCreatorNoteIdsFromHtml(bodyHtml: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const match of bodyHtml.matchAll(NOTE_ID_HTML_RE)) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function mapAnalyzeItems(items: NonNullable<CreatorAnalyzeApiResponse['data']>['note_infos']): CreatorNoteRow[] {
  return (items ?? []).map((item) => ({
    id: item.id ?? '',
    title: item.title ?? '',
    date: formatPostTime(item.post_time),
    views: item.read_count ?? 0,
    likes: item.like_count ?? 0,
    collects: item.fav_count ?? 0,
    comments: item.comment_count ?? 0,
    url: buildNoteDetailUrl(item.id),
  }));
}

async function fetchCreatorNotesByApi(page: any, limit: number): Promise<CreatorNoteRow[]> {
  const pageSize = Math.min(Math.max(limit, 10), 20);
  const maxPages = Math.max(1, Math.ceil(limit / pageSize));
  const notes: CreatorNoteRow[] = [];

  await page.goto(`https://creator.xiaohongshu.com/statistics/data-analysis?type=0&page_size=${pageSize}&page_num=1`);
  await page.wait(4);

  for (let pageNum = 1; pageNum <= maxPages && notes.length < limit; pageNum++) {
    const apiPath = `${NOTE_ANALYZE_API_PATH}?type=0&page_size=${pageSize}&page_num=${pageNum}`;
    const fetched = await page.evaluate(`
      async () => {
        try {
          const resp = await fetch(${JSON.stringify(apiPath)}, { credentials: 'include' });
          if (!resp.ok) return { error: 'HTTP ' + resp.status };
          return await resp.json();
        } catch (e) {
          return { error: e?.message ?? String(e) };
        }
      }
    `) as CreatorAnalyzeApiResponse | undefined;

    let items = fetched?.data?.note_infos ?? [];

    if (!items.length) {
      await page.installInterceptor(NOTE_ANALYZE_API_PATH);
      await page.evaluate(`
        async () => {
          try {
            await fetch(${JSON.stringify(apiPath)}, { credentials: 'include' });
          } catch {}
          return true;
        }
      `);
      await page.wait(1);
      const intercepted = await page.getInterceptedRequests();
      const data = intercepted.find((entry: CreatorAnalyzeApiResponse) => Array.isArray(entry?.data?.note_infos)) as CreatorAnalyzeApiResponse | undefined;
      items = data?.data?.note_infos ?? [];
    }

    if (!items.length) break;

    notes.push(...mapAnalyzeItems(items));
    if (items.length < pageSize) break;
  }

  return notes.slice(0, limit);
}

function deriveCdpHttpBase(endpoint?: string): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      url.pathname = '';
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function resolveRequestedCdpEndpoint(): { endpoint: string | null; requestedCdp: boolean } {
  const endpoint = process.env.OPENCLI_CDP_ENDPOINT?.trim();
  return {
    endpoint: endpoint || null,
    requestedCdp: Boolean(endpoint),
  };
}

async function fetchCreatorNotesByCdp(limit: number): Promise<CreatorNoteRow[]> {
  if (process.env.VITEST) return [];

  const { endpoint, requestedCdp } = resolveRequestedCdpEndpoint();
  if (!requestedCdp) return [];

  const httpBase = deriveCdpHttpBase(endpoint ?? 'http://127.0.0.1:9222') ?? 'http://127.0.0.1:9222';
  const targets = await fetch(`${httpBase}/json/list`).then((resp) => resp.json()) as Array<{
    url?: string;
    webSocketDebuggerUrl?: string;
  }>;
  const target = targets.find((entry) => entry.url?.includes('/statistics/data-analysis') && entry.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) return [];

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();

  const send = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise<any>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  const handlePendingMessage = (event: MessageEvent) => {
    const msg = JSON.parse(String(event.data));
    if (typeof msg.id !== 'number' || !pending.has(msg.id)) return;
    const waiter = pending.get(msg.id)!;
    pending.delete(msg.id);
    if (msg.error) waiter.reject(new Error(msg.error.message));
    else waiter.resolve(msg.result);
  };

  ws.addEventListener('message', handlePendingMessage);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('Failed to connect to CDP data-analysis target')), { once: true });
  });

  const pageSize = Math.min(Math.max(limit, 10), 20);
  const maxPages = Math.max(1, Math.ceil(limit / pageSize));
  const notes: CreatorNoteRow[] = [];

  try {
    await send('Network.enable');
    await send('Page.enable');

    for (let pageNum = 1; pageNum <= maxPages && notes.length < limit; pageNum++) {
      const apiSuffix = `${NOTE_ANALYZE_API_PATH}?type=0&page_size=${pageSize}&page_num=${pageNum}`;
      const pageUrl = `https://creator.xiaohongshu.com/statistics/data-analysis?type=0&page_size=${pageSize}&page_num=${pageNum}`;

      const payload = await new Promise<CreatorAnalyzeApiResponse | null>((resolve) => {
        const listener = async (event: MessageEvent) => {
          const msg = JSON.parse(String(event.data));
          if (typeof msg.id === 'number') return;

          if (msg.method !== 'Network.responseReceived') return;
          const requestId = msg.params?.requestId as string | undefined;
          const responseUrl = msg.params?.response?.url as string | undefined;
          if (!requestId || !responseUrl || !responseUrl.includes(apiSuffix)) return;

          try {
            const bodyResult = await send('Network.getResponseBody', { requestId });
            const parsed = JSON.parse(bodyResult.body) as CreatorAnalyzeApiResponse;
            clearTimeout(timeout);
            ws.removeEventListener('message', listener);
            resolve(parsed);
          } catch {
            clearTimeout(timeout);
            ws.removeEventListener('message', listener);
            resolve(null);
          }
        };

        const timeout = setTimeout(() => {
          ws.removeEventListener('message', listener);
          resolve(null);
        }, 8000);

        ws.addEventListener('message', listener);
        void send('Page.navigate', { url: pageUrl }).catch(() => {
          clearTimeout(timeout);
          ws.removeEventListener('message', listener);
          resolve(null);
        });
      });

      const items = payload?.data?.note_infos ?? [];
      if (!items.length) break;

      notes.push(...mapAnalyzeItems(items));
      if (items.length < pageSize) break;
    }
  } finally {
    ws.removeEventListener('message', handlePendingMessage);
    for (const waiter of pending.values()) {
      waiter.reject(new Error('CDP creator-notes capture closed'));
    }
    pending.clear();
    ws.close();
  }

  return notes.slice(0, limit);
}

export async function fetchCreatorNotes(page: any, limit: number): Promise<CreatorNoteRow[]> {
  let notes = await fetchCreatorNotesByCdp(limit).catch(() => []);

  if (notes.length === 0) {
    notes = await fetchCreatorNotesByApi(page, limit);
  }

  if (notes.length === 0) {
    await page.goto('https://creator.xiaohongshu.com/new/note-manager');
    await page.wait(4);

    const maxPageDowns = Math.max(0, Math.ceil(limit / 10) + 1);
    for (let i = 0; i <= maxPageDowns; i++) {
      const body = await page.evaluate('() => ({ text: document.body.innerText, html: document.body.innerHTML })') as {
        text?: string;
        html?: string;
      };
      const bodyText = typeof body?.text === 'string' ? body.text : '';
      const bodyHtml = typeof body?.html === 'string' ? body.html : '';
      const parsedNotes = parseCreatorNotesText(bodyText);
      const noteIds = parseCreatorNoteIdsFromHtml(bodyHtml);
      notes = parsedNotes.map((note, index) => {
        const id = noteIds[index] ?? '';
        return {
          ...note,
          id,
          url: buildNoteDetailUrl(id),
        };
      });
      if (notes.length >= limit || i === maxPageDowns) break;

      await page.pressKey('PageDown');
      await page.wait(1);
    }
  }

  return notes.slice(0, limit);
}

cli({
  site: 'xiaohongshu',
  name: 'creator-notes',
  description: '小红书创作者笔记列表 + 每篇数据 (标题/日期/观看/点赞/收藏/评论)',
  domain: 'creator.xiaohongshu.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'limit', type: 'int', default: 20, help: 'Number of notes to return' },
  ],
  columns: ['rank', 'id', 'title', 'date', 'views', 'likes', 'collects', 'comments', 'url'],
  func: async (page, kwargs) => {
    const limit = kwargs.limit || 20;
    const notes = await fetchCreatorNotes(page, limit);

    if (!Array.isArray(notes) || notes.length === 0) {
      throw new Error('No notes found. Are you logged into creator.xiaohongshu.com?');
    }

    return notes
      .slice(0, limit)
      .map((n: CreatorNoteRow, i: number) => ({
        rank: i + 1,
        id: n.id,
        title: n.title,
        date: n.date,
        views: n.views,
        likes: n.likes,
        collects: n.collects,
        comments: n.comments,
        url: n.url,
      }));
  },
});
