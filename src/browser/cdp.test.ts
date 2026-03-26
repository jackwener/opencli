import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    private handlers = new Map<string, Array<(...args: any[]) => void>>();

    constructor(_url: string) {
      queueMicrotask(() => this.emit('open'));
    }

    on(event: string, handler: (...args: any[]) => void): void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    send(_message: string): void {}

    close(): void {
      this.readyState = 3;
    }

    private emit(event: string, ...args: any[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }
  }

  return { MockWebSocket };
});

vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

import { CDPBridge, __test__ } from './cdp.js';

function clearPersistentTargetRegistry(): void {
  try {
    fs.unlinkSync(__test__.persistentTargetRegistryPath);
  } catch {
    // Ignore missing file.
  }
}

describe('CDPBridge cookies', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('filters cookies by actual domain match instead of substring match', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    vi.spyOn(bridge, 'send').mockResolvedValue({
      cookies: [
        { name: 'good', value: '1', domain: '.example.com' },
        { name: 'exact', value: '2', domain: 'example.com' },
        { name: 'bad', value: '3', domain: 'notexample.com' },
      ],
    });

    const page = await bridge.connect();
    const cookies = await page.getCookies({ domain: 'example.com' });

    expect(cookies).toEqual([
      { name: 'good', value: '1', domain: '.example.com' },
      { name: 'exact', value: '2', domain: 'example.com' },
    ]);
  });
});

describe('CDP browser websocket helpers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearPersistentTargetRegistry();
  });

  it('accepts browser-level targets that only expose targetId', () => {
    const target = __test__.selectCDPTarget([
      {
        targetId: 'page-1',
        type: 'page',
        title: 'Hacker News',
        url: 'https://news.ycombinator.com/',
      },
      {
        targetId: 'devtools-1',
        type: 'page',
        title: 'DevTools - localhost:9222',
        url: 'devtools://devtools/bundled/inspector.html',
      },
    ]);

    expect(target?.targetId).toBe('page-1');
  });

  it('keeps browser-level attach compatible with app and webview targets', () => {
    const target = __test__.selectBrowserAttachTarget([
      {
        targetId: 'app-1',
        type: 'app',
        title: 'Codex Desktop',
        url: 'file:///app/index.html',
      },
      {
        targetId: 'worker-1',
        type: 'service_worker',
        title: 'Service Worker',
        url: 'https://news.ycombinator.com/sw.js',
      },
      {
        targetId: 'page-1',
        type: 'page',
        title: 'Hacker News',
        url: 'https://news.ycombinator.com/',
      },
    ]);

    expect(target?.targetId).toBe('app-1');
  });

  it('parses browser websocket URLs from DevToolsActivePort content', () => {
    const wsUrl = __test__.parseBrowserWebSocketUrlFromActivePort(
      '9222',
      '127.0.0.1',
      '9222\n/devtools/browser/abc-123\n',
    );

    expect(wsUrl).toBe('ws://127.0.0.1:9222/devtools/browser/abc-123');
  });

  it('parses auto-discovered browser websocket URLs from DevToolsActivePort content', () => {
    const wsUrl = __test__.parseAnyBrowserWebSocketUrlFromActivePort(
      '9333\n/devtools/browser/abc-123\n',
      '127.0.0.1',
    );

    expect(wsUrl).toBe('ws://127.0.0.1:9333/devtools/browser/abc-123');
  });

  it('extracts browser websocket URLs from /json/version payloads', () => {
    expect(__test__.extractBrowserWebSocketUrlFromVersionPayload({
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
    })).toBe('ws://127.0.0.1:9222/devtools/browser/abc');
  });

  it('rewrites loopback /json/version browser websocket URLs onto proxied endpoints', () => {
    expect(__test__.rewriteBrowserWebSocketUrlForEndpoint(
      'https://demo.ngrok.app',
      'ws://127.0.0.1:9222/devtools/browser/abc',
    )).toBe('wss://demo.ngrok.app/devtools/browser/abc');
  });

  it('rewrites loopback /json page websocket URLs onto proxied endpoints too', () => {
    expect(__test__.rewriteBrowserWebSocketUrlForEndpoint(
      'https://demo.ngrok.app',
      'ws://127.0.0.1:9222/devtools/page/abc',
    )).toBe('wss://demo.ngrok.app/devtools/page/abc');
  });

  it('detects browser-level websocket endpoints', () => {
    expect(__test__.isBrowserLevelWebSocket('ws://127.0.0.1:9222/devtools/browser/abc')).toBe(true);
    expect(__test__.isBrowserLevelWebSocket('ws://127.0.0.1:9222/devtools/page/abc')).toBe(false);
  });

  it('accepts IPv6 loopback hosts for local browser websocket fallback', () => {
    expect(__test__.isLoopbackHost('[::1]')).toBe(true);
    expect(__test__.isLoopbackHost('::1')).toBe(true);
    expect(__test__.isLoopbackHost('192.168.0.10')).toBe(false);
  });

  it('prefers a fresh target only for auto-discovered browser sessions without an explicit target hint', () => {
    expect(__test__.shouldPreferNewBrowserTarget('auto')).toBe(true);

    vi.stubEnv('OPENCLI_CDP_TARGET', 'linux.do');
    expect(__test__.shouldPreferNewBrowserTarget('auto')).toBe(false);
    expect(__test__.shouldPreferNewBrowserTarget('http://127.0.0.1:9222')).toBe(false);
  });

  it('normalizes blank workspaces away before persistence decisions', () => {
    expect(__test__.normalizeWorkspaceKey('  site:twitter  ')).toBe('site:twitter');
    expect(__test__.normalizeWorkspaceKey('   ')).toBeUndefined();
  });

  it('matches cached browser targets for app/webview tabs too', () => {
    const target = __test__.selectTargetById([
      {
        targetId: 'webview-1',
        type: 'webview',
        title: 'Embedded App',
        url: 'https://embedded.example/app',
      },
    ], 'webview-1');

    expect(target?.targetId).toBe('webview-1');
  });
});

describe('CDPBridge lifecycle', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearPersistentTargetRegistry();
  });

  it('closes owned blank targets before disconnecting', async () => {
    const bridge = new CDPBridge() as any;
    bridge._ws = { readyState: MockWebSocket.OPEN, close: vi.fn() };
    bridge._ownedTargetId = 'target-1';
    bridge._closeOwnedTargetOnClose = true;

    const sendSpy = vi.spyOn(bridge, 'send').mockResolvedValue({ success: true });

    await bridge.close();

    expect(sendSpy).toHaveBeenCalledWith(
      'Target.closeTarget',
      { targetId: 'target-1' },
      expect.any(Number),
      { root: true },
    );
  });

  it('keeps workspace-persistent targets open on disconnect', async () => {
    const bridge = new CDPBridge() as any;
    bridge._ws = { readyState: MockWebSocket.OPEN, close: vi.fn() };
    bridge._ownedTargetId = 'target-1';
    bridge._closeOwnedTargetOnClose = false;

    const sendSpy = vi.spyOn(bridge, 'send').mockResolvedValue({ success: true });

    await bridge.close();

    expect(sendSpy).not.toHaveBeenCalledWith(
      'Target.closeTarget',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('resets internal command ids on close', async () => {
    const bridge = new CDPBridge() as any;
    bridge._ws = { readyState: MockWebSocket.OPEN, close: vi.fn() };
    bridge._ownedTargetId = 'target-1';
    bridge._closeOwnedTargetOnClose = true;
    bridge._idCounter = 42;

    vi.spyOn(bridge, 'send').mockResolvedValue({ success: true });

    await bridge.close();

    expect(bridge._idCounter).toBe(0);
  });

  it('reuses a stored workspace target before creating a new browser target', async () => {
    const bridge = new CDPBridge() as any;
    bridge._ws = { readyState: MockWebSocket.OPEN, close: vi.fn() };

    fs.writeFileSync(
      __test__.persistentTargetRegistryPath,
      JSON.stringify({
        [__test__.makePersistentTargetRegistryKey('auto', 'site:twitter')]: 'target-keep',
      }),
      'utf8',
    );

    const sendSpy = vi.spyOn(bridge, 'send').mockImplementation(async (...args: unknown[]) => {
      const method = args[0] as string;
      switch (method) {
        case 'Target.getTargets':
          return {
            targetInfos: [
              { targetId: 'target-keep', type: 'page', title: 'X', url: 'https://x.com/home' },
            ],
          };
        case 'Target.activateTarget':
          return {};
        case 'Target.attachToTarget':
          return { sessionId: 'session-1' };
        default:
          return {};
      }
    });

    await bridge.attachToBrowserTarget({
      preferNewTarget: true,
      workspace: 'site:twitter',
      endpointKey: 'auto',
    });

    expect(sendSpy).not.toHaveBeenCalledWith(
      'Target.createTarget',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(bridge._sessionId).toBe('session-1');
  });

  it('lets explicit target hints override a stored workspace target', async () => {
    const bridge = new CDPBridge() as any;
    bridge._ws = { readyState: MockWebSocket.OPEN, close: vi.fn() };

    vi.stubEnv('OPENCLI_CDP_TARGET', 'second');
    fs.writeFileSync(
      __test__.persistentTargetRegistryPath,
      JSON.stringify({
        [__test__.makePersistentTargetRegistryKey('auto', 'site:twitter')]: 'target-keep',
      }),
      'utf8',
    );

    const activated: string[] = [];
    vi.spyOn(bridge, 'send').mockImplementation(async (...args: unknown[]) => {
      const method = args[0] as string;
      const params = args[1] as Record<string, unknown> | undefined;
      switch (method) {
        case 'Target.getTargets':
          return {
            targetInfos: [
              { targetId: 'target-keep', type: 'page', title: 'First Tab', url: 'https://x.com/home' },
              { targetId: 'target-second', type: 'page', title: 'Second Match', url: 'https://second.example' },
            ],
          };
        case 'Target.activateTarget':
          if (params && typeof params.targetId === 'string') activated.push(params.targetId);
          return {};
        case 'Target.attachToTarget':
          return { sessionId: 'session-2' };
        default:
          return {};
      }
    });

    await bridge.attachToBrowserTarget({
      preferNewTarget: true,
      workspace: 'site:twitter',
      endpointKey: 'auto',
    });

    expect(activated).toEqual(['target-second']);
    expect(fs.readFileSync(__test__.persistentTargetRegistryPath, 'utf8')).toContain('"auto::site:twitter": "target-second"');
  });

  it('persists newly created workspace targets for later reuse', async () => {
    const bridge = new CDPBridge() as any;
    bridge._ws = { readyState: MockWebSocket.OPEN, close: vi.fn() };

    vi.spyOn(bridge, 'send').mockImplementation(async (...args: unknown[]) => {
      const method = args[0] as string;
      switch (method) {
        case 'Target.getTargets':
          return { targetInfos: [] };
        case 'Target.createTarget':
          return { targetId: 'target-new' };
        case 'Target.activateTarget':
          return {};
        case 'Target.attachToTarget':
          return { sessionId: 'session-1' };
        default:
          return {};
      }
    });

    await bridge.attachToBrowserTarget({
      preferNewTarget: true,
      workspace: 'site:twitter',
      endpointKey: 'auto',
    });

    expect(fs.existsSync(__test__.persistentTargetRegistryPath)).toBe(true);
    expect(fs.readFileSync(__test__.persistentTargetRegistryPath, 'utf8')).toContain('"auto::site:twitter": "target-new"');
    expect(bridge._closeOwnedTargetOnClose).toBe(false);
  });
});

describe('CDPPage navigation', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('surfaces Page.navigate errorText directly', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    vi.spyOn(bridge, 'send')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ errorText: 'net::ERR_NAME_NOT_RESOLVED' });
    vi.spyOn(bridge, 'waitForEvent').mockRejectedValue(new Error('should not be awaited after errorText'));

    const page = await bridge.connect();

    await expect(page.goto('http://oops-typo.com')).rejects.toThrow('net::ERR_NAME_NOT_RESOLVED');
  });

  it('does not leave an unhandled rejection behind when Page.navigate throws', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    vi.spyOn(bridge, 'send')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Target closed'));
    vi.spyOn(bridge, 'waitForEvent').mockImplementation(() =>
      new Promise((_, reject) => setTimeout(() => reject(new Error('load timeout')), 10))
    );

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const page = await bridge.connect();
      await expect(page.goto('https://example.com')).rejects.toThrow('Target closed');
      await vi.runAllTimersAsync();
      await Promise.resolve();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      vi.useRealTimers();
    }
  });
});
