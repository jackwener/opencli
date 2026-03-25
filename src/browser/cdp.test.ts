import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('detects browser-level websocket endpoints', () => {
    expect(__test__.isBrowserLevelWebSocket('ws://127.0.0.1:9222/devtools/browser/abc')).toBe(true);
    expect(__test__.isBrowserLevelWebSocket('ws://127.0.0.1:9222/devtools/page/abc')).toBe(false);
  });

  it('prefers a fresh target for auto-discovered browser sessions without an explicit target hint', () => {
    expect(__test__.shouldPreferNewBrowserTarget('auto')).toBe(true);

    vi.stubEnv('OPENCLI_CDP_TARGET', 'linux.do');
    expect(__test__.shouldPreferNewBrowserTarget('auto')).toBe(false);
    expect(__test__.shouldPreferNewBrowserTarget('http://127.0.0.1:9222')).toBe(false);
  });
});
