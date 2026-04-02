import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { AuthRequiredError, CommandExecutionError } from '../../errors.js';
import { getRegistry } from '../../registry.js';
import type { IPage } from '../../types.js';
import { buildEnsureComposerOpenJs, buildPublishStatusProbeJs } from './post.js';
import './post.js';

const tempDirs: string[] = [];

function createTempImage(name = 'demo.jpg', bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9])): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-instagram-post-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function withInitialDialogDismiss(results: unknown[]): unknown[] {
  return [{ ok: false }, ...results];
}

function createPageMock(evaluateResults: unknown[], overrides: Partial<IPage> = {}): IPage {
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
    insertText: undefined,
    getCurrentUrl: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('instagram auth detection', () => {
  it('does not treat generic homepage text containing "log in" as an auth failure', () => {
    const globalState = globalThis as typeof globalThis & {
      document?: unknown;
      window?: unknown;
    };

    const originalDocument = globalState.document;
    const originalWindow = globalState.window;

    globalState.document = {
      body: { innerText: 'Suggested for you Log in to see more content' },
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as Document;
    globalState.window = { location: { pathname: '/' } } as unknown as Window & typeof globalThis;

    try {
      expect(eval(buildEnsureComposerOpenJs()) as { ok: boolean; reason?: string }).toEqual({ ok: true });
    } finally {
      globalState.document = originalDocument;
      globalState.window = originalWindow;
    }
  });
});

describe('instagram publish status detection', () => {
  it('does not treat unrelated page text as share failure while the sharing dialog is still visible', () => {
    const globalState = globalThis as typeof globalThis & {
      document?: unknown;
      window?: unknown;
      HTMLElement?: unknown;
    };

    class MockHTMLElement {}

    const visibleDialog = new MockHTMLElement() as MockHTMLElement & {
      textContent: string;
      querySelector: () => null;
      getBoundingClientRect: () => { width: number; height: number };
    };
    visibleDialog.textContent = 'Sharing';
    visibleDialog.querySelector = () => null;
    visibleDialog.getBoundingClientRect = () => ({ width: 100, height: 100 });

    const originalDocument = globalState.document;
    const originalWindow = globalState.window;
    const originalHTMLElement = globalState.HTMLElement;

    globalState.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;
    globalState.document = {
      querySelectorAll: (selector: string) => selector === '[role="dialog"]' ? [visibleDialog] : [],
    } as unknown as Document;
    globalState.window = {
      location: { href: 'https://www.instagram.com/' },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    } as unknown as Window & typeof globalThis;

    try {
      expect(eval(buildPublishStatusProbeJs()) as { failed?: boolean; settled?: boolean; ok?: boolean }).toEqual({
        ok: false,
        failed: false,
        settled: false,
        url: '',
      });
    } finally {
      globalState.document = originalDocument;
      globalState.window = originalWindow;
      globalState.HTMLElement = originalHTMLElement;
    }
  });

  it('does not treat a stale visible error dialog as share failure while sharing is still in progress', () => {
    const globalState = globalThis as typeof globalThis & {
      document?: unknown;
      window?: unknown;
      HTMLElement?: unknown;
    };

    class MockHTMLElement {}

    const sharingDialog = new MockHTMLElement() as MockHTMLElement & {
      textContent: string;
      querySelector: () => null;
      getBoundingClientRect: () => { width: number; height: number };
    };
    sharingDialog.textContent = 'Sharing';
    sharingDialog.querySelector = () => null;
    sharingDialog.getBoundingClientRect = () => ({ width: 100, height: 100 });

    const staleErrorDialog = new MockHTMLElement() as MockHTMLElement & {
      textContent: string;
      querySelector: () => null;
      getBoundingClientRect: () => { width: number; height: number };
    };
    staleErrorDialog.textContent = 'Something went wrong. Please try again. Try again';
    staleErrorDialog.querySelector = () => null;
    staleErrorDialog.getBoundingClientRect = () => ({ width: 100, height: 100 });

    const originalDocument = globalState.document;
    const originalWindow = globalState.window;
    const originalHTMLElement = globalState.HTMLElement;

    globalState.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;
    globalState.document = {
      querySelectorAll: (selector: string) => selector === '[role="dialog"]' ? [sharingDialog, staleErrorDialog] : [],
    } as unknown as Document;
    globalState.window = {
      location: { href: 'https://www.instagram.com/' },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    } as unknown as Window & typeof globalThis;

    try {
      expect(eval(buildPublishStatusProbeJs()) as { failed?: boolean; settled?: boolean; ok?: boolean }).toEqual({
        ok: false,
        failed: false,
        settled: false,
        url: '',
      });
    } finally {
      globalState.document = originalDocument;
      globalState.window = originalWindow;
      globalState.HTMLElement = originalHTMLElement;
    }
  });

  it('prefers explicit post-shared success over stale visible error text', () => {
    const globalState = globalThis as typeof globalThis & {
      document?: unknown;
      window?: unknown;
      HTMLElement?: unknown;
    };

    class MockHTMLElement {}

    const sharedDialog = new MockHTMLElement() as MockHTMLElement & {
      textContent: string;
      querySelector: () => null;
      getBoundingClientRect: () => { width: number; height: number };
    };
    sharedDialog.textContent = 'Post shared Your post has been shared.';
    sharedDialog.querySelector = () => null;
    sharedDialog.getBoundingClientRect = () => ({ width: 100, height: 100 });

    const staleErrorDialog = new MockHTMLElement() as MockHTMLElement & {
      textContent: string;
      querySelector: () => null;
      getBoundingClientRect: () => { width: number; height: number };
    };
    staleErrorDialog.textContent = 'Something went wrong. Please try again. Try again';
    staleErrorDialog.querySelector = () => null;
    staleErrorDialog.getBoundingClientRect = () => ({ width: 100, height: 100 });

    const originalDocument = globalState.document;
    const originalWindow = globalState.window;
    const originalHTMLElement = globalState.HTMLElement;

    globalState.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;
    globalState.document = {
      querySelectorAll: (selector: string) => selector === '[role="dialog"]' ? [sharedDialog, staleErrorDialog] : [],
    } as unknown as Document;
    globalState.window = {
      location: { href: 'https://www.instagram.com/' },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    } as unknown as Window & typeof globalThis;

    try {
      expect(eval(buildPublishStatusProbeJs()) as { failed?: boolean; settled?: boolean; ok?: boolean }).toEqual({
        ok: true,
        failed: false,
        settled: false,
        url: '',
      });
    } finally {
      globalState.document = originalDocument;
      globalState.window = originalWindow;
      globalState.HTMLElement = originalHTMLElement;
    }
  });
});

describe('instagram post registration', () => {
  it('registers the post command with single-image MVP args', () => {
    const cmd = getRegistry().get('instagram/post');
    expect(cmd).toBeDefined();
    expect(cmd?.browser).toBe(true);
    expect(cmd?.timeoutSeconds).toBe(180);
    expect(cmd?.args.some((arg) => arg.name === 'image' && arg.required)).toBe(true);
    expect(cmd?.args.some((arg) => arg.name === 'content' && !arg.required && arg.positional)).toBe(true);
  });

  it('uploads a single image, fills caption, and shares the post', async () => {
    const imagePath = createTempImage();
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: 'https://www.instagram.com/p/ABC123xyz/' },
    ]));

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'hello from opencli',
    });

    expect(page.goto).toHaveBeenCalledWith('https://www.instagram.com/');
    expect(page.setFileInput).toHaveBeenCalledWith([imagePath], '[data-opencli-ig-upload-index="0"]');
    expect((page.evaluate as any).mock.calls.some((args: any[]) => String(args[0]).includes("dispatchEvent(new Event('change'"))).toBe(true);
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/ABC123xyz/',
      },
    ]);
  });

  it('uploads a single image and shares it without a caption when content is omitted', async () => {
    const imagePath = createTempImage('no-caption.jpg');
    const evaluate = vi.fn(async (js: string) => {
      if (js.includes('sharing') && js.includes('create new post')) return { ok: false };
      if (js.includes('window.location?.pathname')) return { ok: true };
      if (js.includes('data-opencli-ig-upload-index')) return { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] };
      if (js.includes("dispatchEvent(new Event('input'")) return { ok: true };
      if (js.includes('const hasPreviewUi =')) return { ok: true, state: 'preview' };
      if (js.includes("scope === 'media'")) return { ok: true, label: 'Next' };
      if (js.includes("scope === 'caption'")) return { ok: true, label: 'Share' };
      if (js.includes('const editable = document.querySelector(\'textarea, [contenteditable="true"]\');')) return { ok: true };
      if (js.includes('post shared') && js.includes('your post has been shared')) return { ok: true, url: 'https://www.instagram.com/p/NOCAPTION123/' };
      return { ok: false };
    });
    const page = createPageMock([], { evaluate });

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
    });

    const evaluateCalls = (page.evaluate as any).mock.calls.map((args: any[]) => String(args[0]));
    expect(evaluateCalls.some((js: string) => js.includes('Write a caption'))).toBe(false);
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/NOCAPTION123/',
      },
    ]);
  });

  it('falls back to browser-side file injection when the extension does not support set-file-input', async () => {
    const imagePath = createTempImage('legacy-extension.jpg');
    const evaluate = vi.fn(async (js: string) => {
      if (js.includes('sharing') && js.includes('create new post')) return { ok: false };
      if (js.includes('window.location?.pathname')) return { ok: true };
      if (js.includes('data-opencli-ig-upload-index')) return { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] };
      if (js.includes('__opencliInstagramUpload_') && js.includes('] = [];')) return { ok: true };
      if (js.includes('parts.push(chunk)')) return { ok: true, count: 1 };
      if (js.includes('File input not found for fallback injection')) return { ok: true, count: 1 };
      if (js.includes('const hasPreviewUi =')) return { ok: true, state: 'preview' };
      if (js.includes("scope === 'caption'")) return { ok: true, label: 'Share' };
      if (js.includes("scope === 'media'")) return { ok: true, label: 'Next' };
      if (js.includes('labels.includes(text)')) return { ok: false };
      if (js.includes('ClipboardEvent') && js.includes('textarea')) return { ok: true, mode: 'textarea' };
      if (js.includes('readLexicalText')) return { ok: true };
      if (js.includes('couldn') && js.includes('your post has been shared')) return { ok: true, url: 'https://www.instagram.com/p/LEGACY123/' };
      return { ok: true };
    });
    const page = createPageMock([], {
      evaluate,
      setFileInput: vi.fn().mockRejectedValue(new Error('Unknown action: set-file-input')),
    });

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'legacy bridge fallback',
    });

    expect(page.setFileInput).toHaveBeenCalledWith([imagePath], '[data-opencli-ig-upload-index="0"]');
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/LEGACY123/',
      },
    ]);
  });

  it('chunks large legacy fallback uploads instead of embedding the whole image in one evaluate payload', async () => {
    const imagePath = createTempImage('legacy-large.jpg', Buffer.alloc(900 * 1024, 1));
    const evaluate = vi.fn(async (js: string) => {
      if (js.includes('sharing') && js.includes('create new post')) return { ok: false };
      if (js.includes('window.location?.pathname')) return { ok: true };
      if (js.includes('data-opencli-ig-upload-index')) return { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] };
      if (js.includes('window[') && js.includes('] = [];')) return { ok: true };
      if (js.includes('parts.push(chunk)')) return { ok: true, count: 1 };
      if (js.includes('File input not found for fallback injection')) return { ok: true, count: 1 };
      if (js.includes('const hasPreviewUi =')) return { ok: true, state: 'preview' };
      if (js.includes("scope === 'caption'")) return { ok: true, label: 'Share' };
      if (js.includes("scope === 'media'")) return { ok: true, label: 'Next' };
      if (js.includes('labels.includes(text)')) return { ok: false };
      if (js.includes('ClipboardEvent') && js.includes('textarea')) return { ok: true, mode: 'textarea' };
      if (js.includes('readLexicalText')) return { ok: true };
      if (js.includes('couldn') && js.includes('your post has been shared')) return { ok: true, url: 'https://www.instagram.com/p/LARGELEGACY123/' };
      return { ok: true };
    });
    const page = createPageMock([], {
      evaluate,
      setFileInput: vi.fn().mockRejectedValue(new Error('Unknown action: set-file-input')),
    });

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'legacy large bridge fallback',
    });

    const chunkCalls = evaluate.mock.calls.filter((args) => String(args[0]).includes('parts.push(chunk)'));
    expect(chunkCalls.length).toBeGreaterThan(1);
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/LARGELEGACY123/',
      },
    ]);
  });

  it('fails clearly when Browser Bridge file upload support is unavailable', async () => {
    const imagePath = createTempImage('missing-bridge.jpg');
    const page = createPageMock([], { setFileInput: undefined });
    const cmd = getRegistry().get('instagram/post');

    await expect(cmd!.func!(page, {
      image: imagePath,
      content: 'hello from opencli',
    })).rejects.toThrow(CommandExecutionError);
  });

  it('maps login-gated composer access to AuthRequiredError', async () => {
    const imagePath = createTempImage('auth.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: false, reason: 'auth' },
    ]));
    const cmd = getRegistry().get('instagram/post');

    await expect(cmd!.func!(page, {
      image: imagePath,
      content: 'login required',
    })).rejects.toThrow(AuthRequiredError);
  });

  it('captures a debug screenshot when the upload preview never appears', async () => {
    const imagePath = createTempImage('no-preview.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
    ]));
    const cmd = getRegistry().get('instagram/post');

    await expect(cmd!.func!(page, {
      image: imagePath,
      content: 'preview missing',
    })).rejects.toThrow('Instagram image preview did not appear after upload');

    expect(page.screenshot).toHaveBeenCalledWith({ path: '/tmp/instagram_post_preview_debug.png' });
  });

  it('fails clearly when Instagram shows an upload-stage error dialog', async () => {
    const imagePath = createTempImage('upload-error.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: false, state: 'failed', detail: 'Something went wrong. Please try again.' },
    ]));
    const cmd = getRegistry().get('instagram/post');

    await expect(cmd!.func!(page, {
      image: imagePath,
      content: 'upload should fail clearly',
    })).rejects.toThrow('Instagram image upload failed');
  });

  it('treats crop/next preview UI as success even if stale error text is still visible', async () => {
    const imagePath = createTempImage('upload-preview-wins.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      {
        ok: false,
        state: 'preview',
        detail: 'Something went wrong. Please try again. Crop Back Next Select crop Select zoom Open media gallery',
      },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: 'https://www.instagram.com/p/PREVIEWWINS123/' },
    ]));
    const cmd = getRegistry().get('instagram/post');

    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'preview state wins over stale error text',
    });

    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/PREVIEWWINS123/',
      },
    ]);
  });

  it('retries the same upload selector once after an upload-stage error and can still succeed', async () => {
    const imagePath = createTempImage('upload-retry.jpg');
    const setFileInput = vi.fn().mockResolvedValue(undefined);
    let uploadProbeCount = 0;
    const evaluate = vi.fn(async (js: string) => {
      if (js.includes('sharing') && js.includes('create new post')) return { ok: false };
      if (js.includes('window.location?.pathname')) return { ok: true };
      if (js.includes('data-opencli-ig-upload-index')) return { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] };
      if (js.includes("dispatchEvent(new Event('input'")) return { ok: true };
      if (js.includes('const failed =') && js.includes('const hasCaption =')) {
        uploadProbeCount += 1;
        return uploadProbeCount === 1
          ? { ok: false, state: 'failed', detail: 'Something went wrong. Please try again.' }
          : { ok: true, state: 'preview' };
      }
      if (js.includes('button[aria-label="Close"]')) return { ok: true };
      if (js.includes("scope === 'media'")) return { ok: true, label: 'Next' };
      if (js.includes('ClipboardEvent') && js.includes('textarea')) return { ok: true, mode: 'textarea' };
      if (js.includes('readLexicalText')) return { ok: true };
      if (js.includes("scope === 'caption'")) return { ok: true, label: 'Share' };
      if (js.includes('post shared') && js.includes('your post has been shared')) return { ok: true, url: 'https://www.instagram.com/p/UPLOADRETRY123/' };
      return { ok: true };
    });
    const page = createPageMock([], { setFileInput, evaluate });
    const cmd = getRegistry().get('instagram/post');

    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'upload retry succeeds',
    });

    expect(setFileInput).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/UPLOADRETRY123/',
      },
    ]);
  });

  it('forces a fresh home reload before retrying after an upload-stage error', async () => {
    const imagePath = createTempImage('upload-fresh-reload.jpg');
    const gotoUrls: string[] = [];
    const goto = vi.fn(async (url: string) => {
      gotoUrls.push(String(url));
    });
    let uploadProbeCount = 0;
    let advancedToCaption = false;
    const evaluate = vi.fn(async (js: string) => {
      if (js.includes('window.location?.pathname')) return { ok: true };
      if (js.includes('data-opencli-ig-upload-index')) return { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] };
      if (js.includes("dispatchEvent(new Event('input'")) return { ok: true };
      if (js.includes("dialogText.includes('write a caption')") || js.includes("const editable = document.querySelector('textarea, [contenteditable=\"true\"]');")) {
        return { ok: advancedToCaption };
      }
      if (js.includes('const hasPreviewUi =')) {
        uploadProbeCount += 1;
        if (uploadProbeCount === 1) {
          return { ok: false, state: 'failed', detail: 'Something went wrong. Please try again.' };
        }
        return gotoUrls.some((url) => url.includes('__opencli_reset='))
          ? { ok: true, state: 'preview' }
          : { ok: false, state: 'failed', detail: 'Something went wrong. Please try again.' };
      }
      if (js.includes('button[aria-label="Close"]')) return { ok: false };
      if (js.includes("scope === 'media'")) {
        advancedToCaption = true;
        return { ok: true, label: 'Next' };
      }
      if (js.includes('ClipboardEvent') && js.includes('textarea')) return { ok: true, mode: 'textarea' };
      if (js.includes('readLexicalText')) return { ok: true };
      if (js.includes("scope === 'caption'")) return { ok: true, label: 'Share' };
      if (js.includes('post shared') && js.includes('your post has been shared')) return { ok: true, url: 'https://www.instagram.com/p/FRESHRELOAD123/' };
      return { ok: false };
    });
    const page = createPageMock([], {
      goto,
      evaluate,
      setFileInput: vi.fn().mockResolvedValue(undefined),
    });
    const cmd = getRegistry().get('instagram/post');

    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'fresh reload after upload failure',
    });

    expect(gotoUrls.some((url) => url.includes('__opencli_reset='))).toBe(true);
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/FRESHRELOAD123/',
      },
    ]);
  });

  it('re-resolves the upload input when the tagged selector goes stale before setFileInput runs', async () => {
    const imagePath = createTempImage('stale-selector.jpg');
    const setFileInput = vi.fn()
      .mockRejectedValueOnce(new Error('No element found matching selector: [data-opencli-ig-upload-index="0"]'))
      .mockResolvedValueOnce(undefined);
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: 'https://www.instagram.com/p/STALE123/' },
    ]), { setFileInput });
    const cmd = getRegistry().get('instagram/post');

    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'stale selector recovery',
    });

    expect(setFileInput).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/STALE123/',
      },
    ]);
  });

  it('retries opening the home composer instead of navigating to the broken /create/select route', async () => {
    const imagePath = createTempImage('retry-composer.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: false },
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: 'https://www.instagram.com/p/FALLBACK123/' },
    ]));
    const cmd = getRegistry().get('instagram/post');

    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'retry composer',
    });

    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith('https://www.instagram.com/');
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/FALLBACK123/',
      },
    ]);
  });

  it('clicks Next twice when Instagram shows an intermediate preview step before the caption editor', async () => {
    const imagePath = createTempImage('double-next.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: false },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: 'https://www.instagram.com/p/DOUBLE123/' },
    ]));
    const cmd = getRegistry().get('instagram/post');

    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'double next flow',
    });

    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/DOUBLE123/',
      },
    ]);
  });

  it('tries the next upload input when the first candidate never opens the preview', async () => {
    const imagePath = createTempImage('second-input.jpg');
    const setFileInput = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]', '[data-opencli-ig-upload-index="1"]'] },
      { ok: true },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: false },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: 'https://www.instagram.com/p/SECOND123/' },
    ]), { setFileInput });

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'second input works',
    });

    expect(setFileInput).toHaveBeenNthCalledWith(1, [imagePath], '[data-opencli-ig-upload-index="0"]');
    expect(setFileInput).toHaveBeenNthCalledWith(2, [imagePath], '[data-opencli-ig-upload-index="1"]');
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/SECOND123/',
      },
    ]);
  });

  it('fails fast when Instagram reports that the post could not be shared', async () => {
    const imagePath = createTempImage('share-failed.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: false, failed: true, url: '' },
    ]));

    const cmd = getRegistry().get('instagram/post');

    await expect(cmd!.func!(page, {
      image: imagePath,
      content: 'share should fail',
    })).rejects.toThrow('Instagram post share failed');
  });

  it('keeps waiting across the full publish timeout window instead of fast-forwarding after 30 polls', async () => {
    const imagePath = createTempImage('slow-share.jpg');
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      ...Array.from({ length: 35 }, () => ({ ok: false, failed: false, settled: false, url: '' })),
      { ok: true, url: 'https://www.instagram.com/p/SLOWSHARE123/' },
    ]));
    const cmd = getRegistry().get('instagram/post');

    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'slow share eventually succeeds',
    });

    const waitCalls = (page.wait as any).mock.calls.filter((args: any[]) => args[0]?.time === 1);
    expect(waitCalls.length).toBeGreaterThanOrEqual(35);
    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/SLOWSHARE123/',
      },
    ]);
  });

  it('does not retry the upload flow after Share has already been clicked', async () => {
    const imagePath = createTempImage('no-duplicate-retry.jpg');
    const setFileInput = vi.fn().mockResolvedValue(undefined);
    const page = createPageMock(withInitialDialogDismiss([
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      ...Array.from({ length: 30 }, () => ({ ok: false, failed: false, url: '' })),
    ]), { setFileInput });

    const cmd = getRegistry().get('instagram/post');

    await expect(cmd!.func!(page, {
      image: imagePath,
      content: 'share observation stalled',
    })).rejects.toThrow('Instagram post share confirmation did not appear');

    expect(setFileInput).toHaveBeenCalledTimes(1);
  });

  it('recovers the latest post URL from the current logged-in profile when success does not navigate to /p/', async () => {
    const imagePath = createTempImage('url-recovery.jpg');
    const page = createPageMock([
      { ok: true, username: 'tsezi_ray' },
      { ok: true, hrefs: ['/tsezi_ray/p/PINNED111/', '/tsezi_ray/p/OLD222/'] },
      { ok: false },
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: '' },
      { ok: true, username: 'tsezi_ray' },
      { ok: true, hrefs: ['/tsezi_ray/p/PINNED111/', '/tsezi_ray/p/OLD222/', '/tsezi_ray/p/RECOVER123/'] },
    ], {
      getCookies: vi.fn().mockResolvedValue([{ name: 'ds_user_id', value: '61236465677', domain: 'instagram.com' }]),
    });

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'url recovery',
    });

    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/tsezi_ray/p/RECOVER123/',
      },
    ]);
  });

  it('treats a closed composer as a successful share and falls back to URL recovery', async () => {
    const imagePath = createTempImage('share-settled.jpg');
    const page = createPageMock([
      { ok: true, username: 'tsezi_ray' },
      { ok: true, hrefs: ['/p/OLD111/'] },
      { ok: false },
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: false, failed: false, settled: true, url: '' },
      { ok: false, failed: false, settled: true, url: '' },
      { ok: false, failed: false, settled: true, url: '' },
      { ok: true, username: 'tsezi_ray' },
      { ok: true, hrefs: ['/p/OLD111/', '/p/RECOVER789/'] },
    ], {
      getCookies: vi.fn().mockResolvedValue([{ name: 'ds_user_id', value: '61236465677', domain: 'instagram.com' }]),
    });

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'share settled recovery',
    });

    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/RECOVER789/',
      },
    ]);
  });

  it('accepts standard /p/... profile links during URL recovery', async () => {
    const imagePath = createTempImage('url-recovery-standard-shape.jpg');
    const page = createPageMock([
      { ok: true, username: 'tsezi_ray' },
      { ok: true, hrefs: ['/p/PINNED111/', '/p/OLD222/'] },
      { ok: false },
      { ok: true },
      { ok: true, selectors: ['[data-opencli-ig-upload-index="0"]'] },
      { ok: true },
      { ok: true },
      { ok: false },
      { ok: true, label: 'Next' },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true, label: 'Share' },
      { ok: true, url: '' },
      { ok: true, username: 'tsezi_ray' },
      { ok: true, hrefs: ['/p/PINNED111/', '/p/OLD222/', '/p/RECOVER456/'] },
    ], {
      getCookies: vi.fn().mockResolvedValue([{ name: 'ds_user_id', value: '61236465677', domain: 'instagram.com' }]),
    });

    const cmd = getRegistry().get('instagram/post');
    const result = await cmd!.func!(page, {
      image: imagePath,
      content: 'url recovery standard shape',
    });

    expect(result).toEqual([
      {
        status: '✅ Posted',
        detail: 'Single image post shared successfully',
        url: 'https://www.instagram.com/p/RECOVER456/',
      },
    ]);
  });
});
