import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    private handlers = new Map<string, Array<(...args: any[]) => void>>();
    /** Sent messages (for inspecting CDP commands) */
    sentMessages: string[] = [];

    constructor(_url: string) {
      queueMicrotask(() => this.emit('open'));
    }

    on(event: string, handler: (...args: any[]) => void): void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    send(message: string): void {
      this.sentMessages.push(message);
    }

    close(): void {
      this.readyState = 3;
    }

    /** Simulate receiving a CDP message from the browser */
    simulateMessage(msg: Record<string, unknown>): void {
      this.emit('message', Buffer.from(JSON.stringify(msg)));
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

import { CDPBridge, type NetworkCaptureEntry } from './cdp.js';

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

describe('CDPPage network capture', () => {
  let bridge: CDPBridge;
  let ws: InstanceType<typeof MockWebSocket>;

  beforeEach(async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');
    bridge = new CDPBridge();
    // Mock send to auto-resolve CDP commands
    vi.spyOn(bridge, 'send').mockImplementation(async (method: string) => {
      if (method === 'Network.enable') return {};
      if (method === 'Page.enable') return {};
      if (method === 'Page.addScriptToEvaluateOnNewDocument') return {};
      if (method === 'Network.getResponseBody') return { body: '{"items":[1,2,3]}' };
      return {};
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await bridge.close();
  });

  it('startNetworkCapture enables Network domain', async () => {
    const page = await bridge.connect();
    await page.startNetworkCapture!();
    expect(bridge.send).toHaveBeenCalledWith('Network.enable', { maxPostDataLength: 0 });
  });

  it('captures requests via CDP events and returns them via readNetworkCapture', async () => {
    const page = await bridge.connect();
    await page.startNetworkCapture!();

    // Simulate CDP events
    const requestId = 'req-1';

    // 1. Request sent
    const requestHandler = (bridge as any)._eventListeners.get('Network.requestWillBeSent');
    expect(requestHandler).toBeDefined();
    for (const fn of requestHandler) {
      fn({
        requestId,
        request: { url: 'https://api.example.com/data', method: 'GET', headers: { 'accept': 'application/json' } },
        wallTime: Date.now() / 1000,
      });
    }

    // 2. Response received
    const responseHandler = (bridge as any)._eventListeners.get('Network.responseReceived');
    for (const fn of responseHandler) {
      fn({
        requestId,
        response: { status: 200, mimeType: 'application/json', headers: { 'content-type': 'application/json' }, encodedDataLength: 1234 },
      });
    }

    // 3. Loading finished
    const finishedHandler = (bridge as any)._eventListeners.get('Network.loadingFinished');
    for (const fn of finishedHandler) {
      fn({ requestId });
    }

    // Read captured entries
    const entries = await page.readNetworkCapture!() as NetworkCaptureEntry[];
    expect(entries.length).toBe(1);
    expect(entries[0].url).toBe('https://api.example.com/data');
    expect(entries[0].method).toBe('GET');
    expect(entries[0].status).toBe(200);
    expect(entries[0].responseContentType).toBe('application/json');
    expect(entries[0].size).toBe(1234);
    expect(entries[0].requestHeaders).toEqual({ 'accept': 'application/json' });
  });

  it('readNetworkCapture returns empty array when no capture started', async () => {
    const page = await bridge.connect();
    const entries = await page.readNetworkCapture!();
    expect(entries).toEqual([]);
  });

  it('startNetworkCapture is idempotent', async () => {
    const page = await bridge.connect();
    await page.startNetworkCapture!();
    await page.startNetworkCapture!(); // second call should be no-op
    // Network.enable should only be called once (plus Page.enable from connect)
    const networkEnableCalls = (bridge.send as any).mock.calls.filter(
      (c: unknown[]) => c[0] === 'Network.enable'
    );
    expect(networkEnableCalls.length).toBe(1);
  });

  it('skips response body for non-textual content types', async () => {
    const page = await bridge.connect();

    // Override send to track getResponseBody calls
    const getResponseBodyCalls: string[] = [];
    (bridge.send as any).mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'Network.getResponseBody') {
        getResponseBodyCalls.push(String(params?.requestId ?? ''));
        return { body: 'binary data' };
      }
      return {};
    });

    await page.startNetworkCapture!();

    // Simulate an image request
    const requestHandler = (bridge as any)._eventListeners.get('Network.requestWillBeSent');
    for (const fn of requestHandler) {
      fn({ requestId: 'img-1', request: { url: 'https://example.com/logo.png', method: 'GET', headers: {} }, wallTime: Date.now() / 1000 });
    }
    const responseHandler = (bridge as any)._eventListeners.get('Network.responseReceived');
    for (const fn of responseHandler) {
      fn({ requestId: 'img-1', response: { status: 200, mimeType: 'image/png', headers: {}, encodedDataLength: 5000 } });
    }
    const finishedHandler = (bridge as any)._eventListeners.get('Network.loadingFinished');
    for (const fn of finishedHandler) {
      fn({ requestId: 'img-1' });
    }

    // Should NOT fetch response body for images
    expect(getResponseBodyCalls).not.toContain('img-1');

    const entries = await page.readNetworkCapture!() as NetworkCaptureEntry[];
    expect(entries.length).toBe(1);
    expect(entries[0].responseBody).toBeUndefined();
  });
});
