/**
 * Jimeng AI task result query — fetch video/image generation result by task_id.
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
    throw new AuthRequiredError('jimeng.jianying.com', `Not logged in`);
  }
  if (ret !== '0' && ret !== 0) {
    throw new CommandExecutionError(
      `${context} failed: ret=${ret} errmsg=${(res.errmsg as string) || ''}`,
    );
  }
}

const STATUS_MAP: Record<number, string> = {
  10: 'queued',
  20: 'processing',
  30: 'failed',
  50: 'completed',
};

cli({
  site: 'jimeng',
  name: 'query_result',
  description: '即梦AI 查异步任务结果 — 获取生成的视频/图片地址',
  domain: 'jimeng.jianying.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'submit_id', type: 'string', required: true, help: '任务 ID（video 命令返回的 task_id）' },
    { name: 'wait', type: 'int', default: 0, help: '轮询等待秒数（默认 0 查一次就返回）' },
  ],
  columns: ['status', 'task_id', 'video_url', 'cover_url'],
  navigateBefore: 'https://jimeng.jianying.com/ai-tool/generate?type=video&workspace=0',

  func: async (page: IPage, kwargs) => {
    const taskId = kwargs.submit_id as string;
    const waitSec = kwargs.wait as number;

    const fetchResult = async () => {
      // Check task status
      const queueResp = await jimengFetch(page, 'get_history_queue_info', {
        history_ids: [taskId],
      });
      checkRet(queueResp, 'get_history_queue_info');

      const qData = queueResp.data as Record<string, Record<string, unknown>> | undefined;
      const taskInfo = qData?.[taskId];

      if (!taskInfo) {
        throw new CommandExecutionError(`Task not found: ${taskId}`);
      }

      const statusCode = taskInfo.status as number;
      const statusText = STATUS_MAP[statusCode] || `unknown(${statusCode})`;

      if (statusCode === 30) {
        return { status: 'failed', task_id: taskId, video_url: '', cover_url: '' };
      }

      if (statusCode !== 50) {
        const queueInfo = taskInfo.queue_info as { queue_idx?: number; queue_length?: number } | undefined;
        const pos = queueInfo ? `${queueInfo.queue_idx}/${queueInfo.queue_length}` : '';
        return { status: pos ? `${statusText} (${pos})` : statusText, task_id: taskId, video_url: '', cover_url: '' };
      }

      // Completed — fetch full result
      const resultResp = await jimengFetch(page, 'get_history_by_ids', {
        history_ids: [taskId],
      });
      checkRet(resultResp, 'get_history_by_ids');

      const rData = resultResp.data as Record<string, Record<string, unknown>> | undefined;
      const historyData = rData?.[taskId];
      const items = (historyData?.item_list as Array<{ video_url?: string; cover_url?: string }>) || [];
      const item = items[0];

      return {
        status: 'completed',
        task_id: taskId,
        video_url: item?.video_url || '',
        cover_url: item?.cover_url || '',
      };
    };

    // Single query
    if (waitSec <= 0) {
      return [await fetchResult()];
    }

    // Poll mode
    const pollInterval = 10;
    const maxPolls = Math.ceil(waitSec / pollInterval);

    for (let i = 0; i < maxPolls; i++) {
      const result = await fetchResult();
      if (result.status === 'completed' || result.status === 'failed') {
        return [result];
      }
      process.stderr.write(`  [${i + 1}/${maxPolls}] ${result.status}, waiting...\n`);
      await new Promise((r) => setTimeout(r, pollInterval * 1000));
    }

    return [{ status: `timeout after ${waitSec}s`, task_id: taskId, video_url: '', cover_url: '' }];
  },
});
