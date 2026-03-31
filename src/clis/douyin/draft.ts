/**
 * Douyin draft — upload through the official creator page and save as draft.
 *
 * The previous API pipeline relied on an old pre-upload endpoint that no longer
 * matches creator center's live upload flow. This command now drives the
 * official upload page directly so it stays aligned with the site.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { cli, Strategy } from '../../registry.js';
import { ArgumentError, CommandExecutionError } from '../../errors.js';
import type { IPage } from '../../types.js';

const VISIBILITY_LABELS: Record<string, string> = {
  public: '公开',
  friends: '好友可见',
  private: '仅自己可见',
};

const DRAFT_UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';

interface DraftComposerState {
  href: string;
  ready: boolean;
  bodyText: string;
}

/**
 * Best-effort dismissal for coach marks and upload tips that can block clicks.
 */
async function dismissKnownModals(page: IPage): Promise<void> {
  await page.evaluate(`() => {
    const targets = ['我知道了', '知道了', '关闭'];
    for (const text of targets) {
      const btn = Array.from(document.querySelectorAll('button,[role="button"]'))
        .find((el) => (el.textContent || '').trim() === text);
      if (btn instanceof HTMLElement) btn.click();
    }
  }`);
}

/**
 * Wait until Douyin finishes uploading and lands on the post-video composer.
 */
async function waitForDraftComposer(page: IPage): Promise<void> {
  let lastState: DraftComposerState = {
    href: '',
    ready: false,
    bodyText: '',
  };

  for (let attempt = 0; attempt < 40; attempt += 1) {
    lastState = (await page.evaluate(`() => ({
      href: location.href,
      ready: !!Array.from(document.querySelectorAll('input')).find(
        (el) => (el.placeholder || '').includes('填写作品标题')
      ) && !!Array.from(document.querySelectorAll('button')).find(
        (el) => (el.textContent || '').includes('暂存离开')
      ),
      bodyText: document.body?.innerText || ''
    })`)) as DraftComposerState;
    if (lastState.ready) return;
    await page.wait({ time: 0.5 });
  }

  throw new CommandExecutionError(
    '等待抖音草稿编辑页超时',
    `当前页面: ${lastState.href || 'unknown'}`,
  );
}

/**
 * Fill title, caption and visibility controls on the live composer page.
 */
async function fillDraftComposer(
  page: IPage,
  options: { title: string; caption: string; visibilityLabel: string },
): Promise<void> {
  const titleOk = (await page.evaluate(`() => {
    const titleInput = Array.from(document.querySelectorAll('input')).find(
      (el) => (el.placeholder || '').includes('填写作品标题')
    );
    if (!(titleInput instanceof HTMLInputElement)) return false;
    titleInput.focus();
    titleInput.value = '';
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, ${JSON.stringify(options.title)});
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }`)) as boolean;
  if (!titleOk) {
    throw new CommandExecutionError(
      '填写抖音草稿表单失败: title-input-missing',
    );
  }

  if (options.caption) {
    const captionOk = (await page.evaluate(`() => {
      const editor = document.querySelector('[contenteditable="true"]');
      if (!(editor instanceof HTMLElement)) return false;
      editor.focus();
      editor.textContent = '';
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, ${JSON.stringify(options.caption)});
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }`)) as boolean;
    if (!captionOk) {
      throw new CommandExecutionError(
        '填写抖音草稿表单失败: caption-editor-missing',
      );
    }
  }

  const visibilityOk = (await page.evaluate(`() => {
    const visibility = Array.from(document.querySelectorAll('label')).find(
      (el) => (el.textContent || '').includes(${JSON.stringify(options.visibilityLabel)})
    );
    if (!(visibility instanceof HTMLElement)) return false;
    visibility.click();
    return true;
  }`)) as boolean;
  if (!visibilityOk) {
    throw new CommandExecutionError(
      '填写抖音草稿表单失败: visibility-missing',
    );
  }
}

/**
 * Switch the composer into custom-cover mode and expose the cover input with a
 * stable selector for CDP file injection.
 */
async function prepareCustomCoverInput(page: IPage): Promise<string> {
  const result = (await page.evaluate(`() => {
    const coverLabel = Array.from(document.querySelectorAll('label')).find(
      (el) => (el.textContent || '').includes('上传新封面')
    );
    if (coverLabel instanceof HTMLElement) {
      coverLabel.click();
    }

    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const target = inputs.at(-1);
    if (!(target instanceof HTMLInputElement)) {
      return { ok: false, reason: 'cover-input-missing' };
    }

    target.setAttribute('data-opencli-cover-input', '1');
    return { ok: true, selector: '[data-opencli-cover-input="1"]' };
  })`)) as { ok?: boolean; reason?: string; selector?: string };

  if (!result?.ok || !result.selector) {
    throw new CommandExecutionError(
      `准备抖音自定义封面输入框失败: ${result?.reason || 'unknown'}`,
    );
  }

  return result.selector;
}

/**
 * Click the draft button on the composer page.
 */
async function clickSaveDraft(page: IPage): Promise<void> {
  const result = (await page.evaluate(`() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (el) => (el.textContent || '').includes('暂存离开')
    );
    if (!(btn instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'draft-button-missing' };
    }
    btn.click();
    return { ok: true, text: (btn.textContent || '').trim() };
  }`)) as { ok?: boolean; reason?: string };

  if (!result?.ok) {
    throw new CommandExecutionError(
      `点击草稿按钮失败: ${result?.reason || 'unknown'}`,
    );
  }
}

function extractAwemeId(payloads: unknown[]): string {
  for (const payload of payloads) {
    if (!payload || typeof payload !== 'object') continue;
    const row = payload as Record<string, unknown>;
    const direct = row.aweme_id;
    if (typeof direct === 'string' && direct) return direct;
    const nested = row.data;
    if (nested && typeof nested === 'object') {
      const nestedAwemeId = (nested as Record<string, unknown>).aweme_id;
      if (typeof nestedAwemeId === 'string' && nestedAwemeId) return nestedAwemeId;
    }
  }
  return '';
}

/**
 * Wait for the save-draft request to complete and extract the new aweme id.
 */
async function waitForDraftResult(page: IPage): Promise<string> {
  let lastState = { href: '', bodyText: '' };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const intercepted = await page.getInterceptedRequests();
    const awemeId = extractAwemeId(intercepted);
    if (awemeId) return awemeId;

    lastState = (await page.evaluate(`() => ({
      href: location.href,
      bodyText: document.body?.innerText || ''
    })`)) as { href: string; bodyText: string };

    if (
      lastState.href.includes('/creator-micro/content/manage')
      && /草稿|暂存/.test(lastState.bodyText)
    ) {
      break;
    }

    await page.wait({ time: 1 });
  }

  throw new CommandExecutionError(
    '草稿保存成功但未捕获 aweme_id',
    `当前页面: ${lastState.href || 'unknown'}`,
  );
}

cli({
  site: 'douyin',
  name: 'draft',
  description: '上传视频并保存为草稿',
  domain: 'creator.douyin.com',
  strategy: Strategy.COOKIE,
  navigateBefore: false,
  args: [
    { name: 'video', required: true, positional: true, help: '视频文件路径' },
    { name: 'title', required: true, help: '视频标题（≤30字）' },
    { name: 'caption', default: '', help: '正文内容（≤1000字，支持 #话题）' },
    { name: 'cover', default: '', help: '封面图片路径' },
    { name: 'visibility', default: 'public', choices: ['public', 'friends', 'private'] },
  ],
  columns: ['status', 'aweme_id'],
  func: async (page: IPage, kwargs) => {
    const videoPath = path.resolve(kwargs.video as string);
    if (!fs.existsSync(videoPath)) {
      throw new ArgumentError(`视频文件不存在: ${videoPath}`);
    }
    const ext = path.extname(videoPath).toLowerCase();
    if (!['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
      throw new ArgumentError(`不支持的视频格式: ${ext}（支持 mp4/mov/avi/webm）`);
    }

    const title = kwargs.title as string;
    if (title.length > 30) {
      throw new ArgumentError('标题不能超过 30 字');
    }

    const caption = (kwargs.caption as string) || '';
    if (caption.length > 1000) {
      throw new ArgumentError('正文不能超过 1000 字');
    }

    const coverPath = kwargs.cover as string;
    if (coverPath) {
      if (!fs.existsSync(path.resolve(coverPath))) {
        throw new ArgumentError(`封面文件不存在: ${path.resolve(coverPath)}`);
      }
    }

    if (!page.setFileInput) {
      throw new CommandExecutionError(
        '当前浏览器适配器不支持文件注入',
        '请使用 Browser Bridge 或支持 setFileInput 的浏览器模式',
      );
    }

    const visibilityLabel = VISIBILITY_LABELS[kwargs.visibility as string] ?? VISIBILITY_LABELS.public;

    await page.goto(DRAFT_UPLOAD_URL);
    await page.wait({ selector: 'input[type="file"]', timeout: 20 });
    await dismissKnownModals(page);
    await page.installInterceptor('create_v2');
    await page.setFileInput([videoPath], 'input[type="file"]');
    await waitForDraftComposer(page);
    await dismissKnownModals(page);
    if (coverPath) {
      const coverSelector = await prepareCustomCoverInput(page);
      await page.setFileInput([path.resolve(coverPath)], coverSelector);
      await page.wait({ time: 1 });
    }
    await fillDraftComposer(page, { title, caption, visibilityLabel });
    await page.wait({ time: 1 });
    await clickSaveDraft(page);

    const awemeId = await waitForDraftResult(page);

    return [
      {
        status: '✅ 草稿保存成功！',
        aweme_id: awemeId,
      },
    ];
  },
});
