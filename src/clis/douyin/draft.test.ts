import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { getRegistry } from '../../registry.js';
import type { IPage } from '../../types.js';
import './draft.js';

function createPageMock(
  evaluateResults: unknown[],
  overrides: Partial<IPage> = {},
): IPage {
  const evaluate = vi.fn();
  for (const result of evaluateResults) {
    evaluate.mockResolvedValueOnce(result);
  }

  return {
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate,
    getCookies: vi.fn().mockResolvedValue([]),
    snapshot: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
    scrollTo: vi.fn().mockResolvedValue(undefined),
    getFormState: vi.fn().mockResolvedValue({ forms: [], orphanFields: [] }),
    wait: vi.fn().mockResolvedValue(undefined),
    tabs: vi.fn().mockResolvedValue([]),
    closeTab: vi.fn().mockResolvedValue(undefined),
    newTab: vi.fn().mockResolvedValue(undefined),
    selectTab: vi.fn().mockResolvedValue(undefined),
    networkRequests: vi.fn().mockResolvedValue([]),
    consoleMessages: vi.fn().mockResolvedValue([]),
    scroll: vi.fn().mockResolvedValue(undefined),
    autoScroll: vi.fn().mockResolvedValue(undefined),
    installInterceptor: vi.fn().mockResolvedValue(undefined),
    getInterceptedRequests: vi.fn().mockResolvedValue([]),
    waitForCapture: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(''),
    setFileInput: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('douyin draft registration', () => {
  it('registers the draft command', () => {
    const registry = getRegistry();
    const values = [...registry.values()];
    const cmd = values.find(c => c.site === 'douyin' && c.name === 'draft');
    expect(cmd).toBeDefined();
  });

  it('uploads through the official creator draft page and saves the draft', async () => {
    const registry = getRegistry();
    const cmd = [...registry.values()].find(c => c.site === 'douyin' && c.name === 'draft');
    expect(cmd?.func).toBeTypeOf('function');
    if (!cmd?.func) throw new Error('douyin draft command not registered');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-douyin-draft-'));
    const videoPath = path.join(tempDir, 'demo.mp4');
    fs.writeFileSync(videoPath, Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]));

    const page = createPageMock(
      [
        undefined,
        { href: 'https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page', ready: true },
        undefined,
        true,
        true,
        true,
        { ok: true, text: '暂存离开' },
      ],
      {
        getInterceptedRequests: vi.fn().mockResolvedValue([
          { aweme_id: '746001' },
        ]),
      },
    );

    const rows = await cmd.func(page, {
      video: videoPath,
      title: '最小修复验证',
      caption: 'opencli draft e2e',
      cover: '',
      visibility: 'friends',
    });

    expect(page.goto).toHaveBeenCalledWith(
      'https://creator.douyin.com/creator-micro/content/upload',
    );
    expect(page.wait).toHaveBeenCalledWith({
      selector: 'input[type="file"]',
      timeout: 20,
    });
    expect(page.installInterceptor).toHaveBeenCalledWith('create_v2');
    expect(page.setFileInput).toHaveBeenCalledWith([videoPath], 'input[type="file"]');

    const evaluateCalls = (page.evaluate as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => String(args[0]),
    );
    expect(evaluateCalls.some((code: string) => code.includes('填写作品标题'))).toBe(true);
    expect(evaluateCalls.some((code: string) => code.includes('好友可见'))).toBe(true);
    expect(evaluateCalls.some((code: string) => code.includes('暂存离开'))).toBe(true);

    expect(rows).toEqual([
      {
        status: '✅ 草稿保存成功！',
        aweme_id: '746001',
      },
    ]);
  });

  it('uses the dedicated cover upload input when a custom cover is provided', async () => {
    const registry = getRegistry();
    const cmd = [...registry.values()].find(c => c.site === 'douyin' && c.name === 'draft');
    expect(cmd?.func).toBeTypeOf('function');
    if (!cmd?.func) throw new Error('douyin draft command not registered');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-douyin-draft-'));
    const videoPath = path.join(tempDir, 'demo.mp4');
    const coverPath = path.join(tempDir, 'cover.jpg');
    fs.writeFileSync(videoPath, Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]));
    fs.writeFileSync(coverPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const page = createPageMock(
      [
        undefined,
        { href: 'https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page', ready: true },
        undefined,
        { ok: true, selector: '[data-opencli-cover-input="1"]' },
        true,
        true,
        { ok: true, text: '暂存离开' },
      ],
      {
        getInterceptedRequests: vi.fn().mockResolvedValue([
          { aweme_id: '746002' },
        ]),
      },
    );

    const rows = await cmd.func(page, {
      video: videoPath,
      title: '封面上传验证',
      caption: '',
      cover: coverPath,
      visibility: 'public',
    });

    expect(page.setFileInput).toHaveBeenNthCalledWith(1, [videoPath], 'input[type="file"]');
    expect(page.setFileInput).toHaveBeenNthCalledWith(2, [coverPath], '[data-opencli-cover-input="1"]');

    const evaluateCalls = (page.evaluate as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => String(args[0]),
    );
    expect(evaluateCalls.some((code: string) => code.includes('上传新封面'))).toBe(true);

    expect(rows).toEqual([
      {
        status: '✅ 草稿保存成功！',
        aweme_id: '746002',
      },
    ]);
  });
});
