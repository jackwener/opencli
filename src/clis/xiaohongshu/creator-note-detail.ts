/**
 * Xiaohongshu Creator Note Detail — per-note analytics from the creator detail page.
 *
 * The current creator center no longer serves stable single-note metrics from the legacy
 * `/api/galaxy/creator/data/note_detail` endpoint. The real note detail page loads data
 * through the newer `datacenter/note/*` API family, so this command navigates to the
 * detail page and parses the rendered metrics that are backed by those APIs.
 *
 * Requires: logged into creator.xiaohongshu.com in Chrome.
 */

import { cli, Strategy } from '../../registry.js';

type CreatorNoteDetailRow = {
  section: string;
  metric: string;
  value: string;
  extra: string;
};

export type { CreatorNoteDetailRow };

type AudienceSourceItem = {
  title?: string;
  value_with_double?: number;
  info?: {
    imp_count?: number;
    view_count?: number;
    interaction_count?: number;
  };
};

type AudiencePortraitItem = {
  title?: string;
  value?: number;
};

type NoteTrendPoint = {
  date?: number;
  count?: number;
  count_with_double?: number;
};

type NoteTrendBucket = {
  imp_list?: NoteTrendPoint[];
  view_list?: NoteTrendPoint[];
  view_time_list?: NoteTrendPoint[];
  like_list?: NoteTrendPoint[];
  comment_list?: NoteTrendPoint[];
  collect_list?: NoteTrendPoint[];
  share_list?: NoteTrendPoint[];
  rise_fans_list?: NoteTrendPoint[];
};

type NoteDetailApiPayload = {
  noteBase?: {
    hour?: NoteTrendBucket;
    day?: NoteTrendBucket;
  };
  audienceTrend?: {
    no_data?: boolean;
    no_data_tip_msg?: string;
  };
  audienceSource?: {
    source?: AudienceSourceItem[];
  };
  audienceSourceDetail?: {
    gender?: AudiencePortraitItem[];
    age?: AudiencePortraitItem[];
    city?: AudiencePortraitItem[];
    interest?: AudiencePortraitItem[];
  };
};

const NOTE_DETAIL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const NOTE_DETAIL_METRICS = [
  { label: '曝光数', section: '基础数据' },
  { label: '观看数', section: '基础数据' },
  { label: '封面点击率', section: '基础数据' },
  { label: '平均观看时长', section: '基础数据' },
  { label: '涨粉数', section: '基础数据' },
  { label: '点赞数', section: '互动数据' },
  { label: '评论数', section: '互动数据' },
  { label: '收藏数', section: '互动数据' },
  { label: '分享数', section: '互动数据' },
] as const;

const NOTE_DETAIL_METRIC_LABELS = new Set<string>(NOTE_DETAIL_METRICS.map((metric) => metric.label));
const NOTE_DETAIL_NOISE_LINES = new Set([
  '切换笔记',
  '笔记诊断',
  '核心数据',
  '观看来源',
  '观众画像',
  '提升建议',
  '基础数据',
  '互动数据',
  '导出数据',
  '实时',
  '按小时',
  '按天',
]);

function findNoteTitle(lines: string[]): string {
  const detailIndex = lines.indexOf('笔记数据详情');
  if (detailIndex < 0) return '';

  for (let i = detailIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#') || NOTE_DETAIL_DATETIME_RE.test(line)) continue;
    if (NOTE_DETAIL_NOISE_LINES.has(line)) continue;
    return line;
  }

  return '';
}

function findMetricValue(lines: string[], startIndex: number): { value: string; extra: string } {
  let value = '';
  let extra = '';

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (NOTE_DETAIL_METRIC_LABELS.has(line)) break;
    if (NOTE_DETAIL_NOISE_LINES.has(line) || line.startsWith('数据更新至') || line.startsWith('部分数据统计中')) continue;

    if (!value) {
      value = line;
      continue;
    }

    if (!extra && line.startsWith('粉丝')) {
      extra = line;
      break;
    }

    if (line === '0' || /^\d/.test(line) || line.endsWith('%') || line.endsWith('秒')) {
      break;
    }
  }

  return { value, extra };
}

export function parseCreatorNoteDetailText(bodyText: string, noteId: string): CreatorNoteDetailRow[] {
  const lines = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const title = findNoteTitle(lines);
  const publishedAt = lines.find((line) => NOTE_DETAIL_DATETIME_RE.test(line)) ?? '';
  const rows: CreatorNoteDetailRow[] = [
    { section: '笔记信息', metric: 'note_id', value: noteId, extra: '' },
    { section: '笔记信息', metric: 'title', value: title, extra: '' },
    { section: '笔记信息', metric: 'published_at', value: publishedAt, extra: '' },
  ];

  for (const metric of NOTE_DETAIL_METRICS) {
    const index = lines.indexOf(metric.label);
    if (index < 0) continue;
    const { value, extra } = findMetricValue(lines, index);
    rows.push({
      section: metric.section,
      metric: metric.label,
      value,
      extra,
    });
  }

  return rows;
}

function toPercentString(value?: number): string {
  return value == null ? '' : `${value}%`;
}

function appendAudienceSourceRows(rows: CreatorNoteDetailRow[], payload?: NoteDetailApiPayload): CreatorNoteDetailRow[] {
  const sourceItems = payload?.audienceSource?.source ?? [];
  for (const item of sourceItems) {
    if (!item.title) continue;
    const extras: string[] = [];
    if (item.info?.imp_count != null) extras.push(`曝光 ${item.info.imp_count}`);
    if (item.info?.view_count != null) extras.push(`观看 ${item.info.view_count}`);
    if (item.info?.interaction_count != null) extras.push(`互动 ${item.info.interaction_count}`);
    rows.push({
      section: '观看来源',
      metric: item.title,
      value: toPercentString(item.value_with_double),
      extra: extras.join(' · '),
    });
  }
  return rows;
}

function appendAudiencePortraitGroup(
  rows: CreatorNoteDetailRow[],
  groupLabel: string,
  items?: AudiencePortraitItem[],
): CreatorNoteDetailRow[] {
  for (const item of items ?? []) {
    if (!item.title) continue;
    rows.push({
      section: '观众画像',
      metric: `${groupLabel}/${item.title}`,
      value: toPercentString(item.value),
      extra: '',
    });
  }
  return rows;
}

export function appendAudienceRows(rows: CreatorNoteDetailRow[], payload?: NoteDetailApiPayload): CreatorNoteDetailRow[] {
  appendAudienceSourceRows(rows, payload);
  appendAudiencePortraitGroup(rows, '性别', payload?.audienceSourceDetail?.gender);
  appendAudiencePortraitGroup(rows, '年龄', payload?.audienceSourceDetail?.age);
  appendAudiencePortraitGroup(rows, '城市', payload?.audienceSourceDetail?.city);
  appendAudiencePortraitGroup(rows, '兴趣', payload?.audienceSourceDetail?.interest);
  return rows;
}

function formatTrendTimestamp(ts: number | undefined, granularity: 'hour' | 'day'): string {
  if (!ts) return '';
  const date = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, '0');
  if (granularity === 'hour') {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:00`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTrendSeries(points: NoteTrendPoint[] | undefined, granularity: 'hour' | 'day'): string {
  if (!points?.length) return '';
  return points
    .map((point) => {
      const label = formatTrendTimestamp(point.date, granularity);
      const value = point.count_with_double ?? point.count;
      return label && value != null ? `${label}=${value}` : '';
    })
    .filter(Boolean)
    .join(' | ');
}

const TREND_SERIES_CONFIG = [
  { key: 'imp_list', label: '曝光数' },
  { key: 'view_list', label: '观看数' },
  { key: 'view_time_list', label: '平均观看时长' },
  { key: 'like_list', label: '点赞数' },
  { key: 'comment_list', label: '评论数' },
  { key: 'collect_list', label: '收藏数' },
  { key: 'share_list', label: '分享数' },
  { key: 'rise_fans_list', label: '涨粉数' },
] as const;

export function appendTrendRows(rows: CreatorNoteDetailRow[], payload?: NoteDetailApiPayload): CreatorNoteDetailRow[] {
  if (payload?.audienceTrend?.no_data_tip_msg) {
    rows.push({
      section: '趋势说明',
      metric: '观众趋势',
      value: payload.audienceTrend.no_data ? '暂不可用' : '可用',
      extra: payload.audienceTrend.no_data_tip_msg,
    });
  }

  const buckets: Array<{ label: string; granularity: 'hour' | 'day'; data?: NoteTrendBucket }> = [
    { label: '按小时', granularity: 'hour', data: payload?.noteBase?.hour },
    { label: '按天', granularity: 'day', data: payload?.noteBase?.day },
  ];

  for (const bucket of buckets) {
    for (const series of TREND_SERIES_CONFIG) {
      const points = bucket.data?.[series.key];
      const formatted = formatTrendSeries(points, bucket.granularity);
      if (!formatted) continue;
      rows.push({
        section: '趋势数据',
        metric: `${bucket.label}/${series.label}`,
        value: `${points!.length} points`,
        extra: formatted,
      });
    }
  }

  return rows;
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

async function captureNoteDetailApiPayload(noteId: string): Promise<NoteDetailApiPayload | null> {
  const { endpoint, requestedCdp } = resolveRequestedCdpEndpoint();
  if (!requestedCdp) return null;

  const httpBase = deriveCdpHttpBase(endpoint ?? 'http://127.0.0.1:9222') ?? 'http://127.0.0.1:9222';
  const targets = await fetch(`${httpBase}/json/list`).then((resp) => resp.json()) as Array<{
    url?: string;
    webSocketDebuggerUrl?: string;
  }>;
  const target = targets.find((entry) => entry.url?.includes(`/statistics/note-detail?noteId=${noteId}`) && entry.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) return null;

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const payload: NoteDetailApiPayload = {};
  const pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  const desiredUrls = new Map<string, keyof NoteDetailApiPayload>([
    [`/api/galaxy/creator/datacenter/note/base?note_id=${noteId}`, 'noteBase'],
    [`/api/galaxy/creator/datacenter/note/analyze/audience/trend?note_id=${noteId}`, 'audienceTrend'],
    [`/api/galaxy/creator/datacenter/note/audience/source?note_id=${noteId}`, 'audienceSource'],
    [`/api/galaxy/creator/datacenter/note/audience/source/detail?note_id=${noteId}`, 'audienceSourceDetail'],
  ]);
  let nextId = 1;

  const send = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise<any>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  const completed = new Set<keyof NoteDetailApiPayload>();
  const waitForPayload = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 8000);
    ws.addEventListener('message', async (event) => {
      const msg = JSON.parse(String(event.data));
      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        const waiter = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(msg.error.message));
        else waiter.resolve(msg.result);
        return;
      }

      if (msg.method === 'Network.responseReceived') {
        const requestId = msg.params?.requestId as string | undefined;
        const responseUrl = msg.params?.response?.url as string | undefined;
        if (!requestId || !responseUrl) return;
        for (const [suffix, key] of desiredUrls) {
          if (!responseUrl.includes(suffix)) continue;
          try {
            const bodyResult = await send('Network.getResponseBody', { requestId });
            const parsed = JSON.parse(bodyResult.body);
            payload[key] = parsed.data ?? {};
            completed.add(key);
            if (completed.size === desiredUrls.size) {
              clearTimeout(timeout);
              resolve();
            }
          } catch {}
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('Failed to connect to CDP note-detail target')), { once: true });
  });

  try {
    await send('Network.enable');
    await send('Page.enable');
    await send('Page.reload', { ignoreCache: true });
    await waitForPayload;
  } finally {
    for (const waiter of pending.values()) {
      waiter.reject(new Error('CDP note detail capture closed'));
    }
    pending.clear();
    ws.close();
  }

  return completed.size > 0 ? payload : null;
}

export async function fetchCreatorNoteDetailRows(page: any, noteId: string): Promise<CreatorNoteDetailRow[]> {
  await page.goto(`https://creator.xiaohongshu.com/statistics/note-detail?noteId=${encodeURIComponent(noteId)}`);
  await page.wait(4);

  const bodyText = await page.evaluate('() => document.body.innerText');
  const rows = parseCreatorNoteDetailText(typeof bodyText === 'string' ? bodyText : '', noteId);
  const apiPayload = await captureNoteDetailApiPayload(noteId).catch(() => null);
  appendTrendRows(rows, apiPayload ?? undefined);
  appendAudienceRows(rows, apiPayload ?? undefined);

  return rows;
}

cli({
  site: 'xiaohongshu',
  name: 'creator-note-detail',
  description: '小红书单篇笔记详情页数据 (笔记信息 + 核心/互动数据 + 观看来源 + 观众画像 + 趋势数据)',
  domain: 'creator.xiaohongshu.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'note_id', type: 'string', required: true, help: 'Note ID (from creator-notes or note-detail page URL)' },
  ],
  columns: ['section', 'metric', 'value', 'extra'],
  func: async (page, kwargs) => {
    const noteId: string = kwargs.note_id;
    const rows = await fetchCreatorNoteDetailRows(page, noteId);

    const hasCoreMetric = rows.some((row) => row.section !== '笔记信息' && row.value);
    if (!hasCoreMetric) {
      throw new Error('No note detail data found. Check note_id and login status for creator.xiaohongshu.com.');
    }

    return rows;
  },
});
