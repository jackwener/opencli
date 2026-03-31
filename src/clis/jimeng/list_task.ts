/**
 * Jimeng AI list tasks — view recent generation history (images + videos).
 */

import { cli, Strategy } from '../../registry.js';
import { AuthRequiredError, CommandExecutionError } from '../../errors.js';
import type { IPage } from '../../types.js';

const JIMENG_API = '/mweb/v1';
const COMMON_PARAMS = 'aid=513695&web_version=7.5.0&da_version=3.3.12';

async function jimengFetch(
  page: IPage,
  endpoint: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const url = `${JIMENG_API}/${endpoint}?${COMMON_PARAMS}`;
  const js = `
    fetch(${JSON.stringify(url)}, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: ${JSON.stringify(JSON.stringify(body))}
    }).then(r => r.json())
  `;
  return (await page.evaluate(js)) as Record<string, unknown>;
}

function checkRet(res: Record<string, unknown>, context: string): void {
  const ret = res.ret;
  if (ret === '1014' || ret === 1014) {
    throw new AuthRequiredError('jimeng.jianying.com', 'Not logged in');
  }
  if (ret !== '0' && ret !== 0) {
    throw new CommandExecutionError(
      `${context} failed: ret=${ret} errmsg=${(res.errmsg as string) || ''}`,
    );
  }
}

interface HistoryItem {
  history_id?: string;
  common_attr?: {
    title?: string;
    status?: number;
    create_time?: number;
  };
  aigc_image_params?: {
    text2image_params?: {
      prompt?: string;
      model_config?: { model_name?: string };
    };
  };
  image?: {
    large_images?: Array<{ image_url?: string }>;
  };
  item_list?: Array<{ video_url?: string; cover_url?: string }>;
}

const STATUS_MAP: Record<number, string> = {
  50: 'queued',
  100: 'processing',
  102: 'completed',
  103: 'failed',
};

cli({
  site: 'jimeng',
  name: 'list_task',
  description: '即梦AI 查历史任务 — 列出最近生成的图片/视频任务',
  domain: 'jimeng.jianying.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'limit', type: 'int', default: 10, help: '返回条数（默认 10）' },
  ],
  columns: ['task_id', 'prompt', 'status', 'type', 'url', 'created_at'],
  navigateBefore: 'https://jimeng.jianying.com/ai-tool/generate?type=video&workspace=0',

  func: async (page: IPage, kwargs) => {
    const limit = kwargs.limit as number;

    const resp = await jimengFetch(page, 'get_history', {
      cursor: '',
      count: limit,
      need_page_item: true,
      need_aigc_data: true,
      aigc_mode_list: ['workbench'],
    });
    checkRet(resp, 'get_history');

    const data = resp.data as { history_list?: HistoryItem[] } | undefined;
    const items = data?.history_list || [];

    return items.slice(0, limit).map((item) => {
      const statusCode = item.common_attr?.status ?? 0;
      const statusText = STATUS_MAP[statusCode] || `unknown(${statusCode})`;

      const prompt =
        item.aigc_image_params?.text2image_params?.prompt ||
        item.common_attr?.title ||
        '';

      // Determine type and URL
      const videoItems = item.item_list || [];
      const imageItems = item.image?.large_images || [];
      let type = 'unknown';
      let url = '';

      if (videoItems.length > 0 && videoItems[0].video_url) {
        type = 'video';
        url = videoItems[0].video_url;
      } else if (imageItems.length > 0 && imageItems[0].image_url) {
        type = 'image';
        url = imageItems[0].image_url;
      }

      const createdAt = item.common_attr?.create_time
        ? new Date(item.common_attr.create_time * 1000).toLocaleString('zh-CN')
        : '';

      return {
        task_id: item.history_id || '',
        prompt: prompt.length > 50 ? prompt.substring(0, 47) + '...' : prompt,
        status: statusText,
        type,
        url,
        created_at: createdAt,
      };
    });
  },
});
