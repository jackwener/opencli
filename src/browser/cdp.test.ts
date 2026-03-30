import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    private handlers = new Map<string, Array<(...args: any[]) => void>>();
    sent: any[] = [];
    static instances: MockWebSocket[] = [];

    constructor(_url: string) {
      MockWebSocket.instances.push(this);
      queueMicrotask(() => this.emit('open'));
    }

    on(event: string, handler: (...args: any[]) => void): void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    send(message: string): void {
      const payload = JSON.parse(message);
      this.sent.push(payload);

      if (payload.method === 'Target.createTarget') {
        queueMicrotask(() => this.emit('message', JSON.stringify({
          id: payload.id,
          result: { targetId: 'target-1' },
        })));
        return;
      }

      if (payload.method === 'Target.attachToTarget') {
        queueMicrotask(() => this.emit('message', JSON.stringify({
          id: payload.id,
          result: { sessionId: 'session-1' },
        })));
        return;
      }

      queueMicrotask(() => this.emit('message', JSON.stringify({
        id: payload.id,
        result: {},
        sessionId: payload.sessionId,
      })));
    }

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

import { CDPBridge } from './cdp.js';

describe('CDPBridge cookies', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    MockWebSocket.instances.length = 0;
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

  it('attaches to a browser-level websocket endpoint and scopes page commands to the target session', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/browser/browser-1');

    const bridge = new CDPBridge();
    await bridge.connect();

    const sent = MockWebSocket.instances[0]?.sent ?? [];
    expect(sent.map((item) => item.method)).toEqual([
      'Target.createTarget',
      'Target.attachToTarget',
      'Page.enable',
      'Page.addScriptToEvaluateOnNewDocument',
    ]);
    expect(sent[1]).toMatchObject({
      method: 'Target.attachToTarget',
      params: { targetId: 'target-1', flatten: true },
    });
    expect(sent[2]).toMatchObject({
      method: 'Page.enable',
      sessionId: 'session-1',
    });
    expect(sent[3]).toMatchObject({
      method: 'Page.addScriptToEvaluateOnNewDocument',
      sessionId: 'session-1',
    });
  });
});
