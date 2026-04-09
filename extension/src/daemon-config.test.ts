import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  buildDaemonUrls,
  getDaemonEndpointConfig,
} from './daemon-config';

describe('extension daemon-config', () => {
  it('returns defaults when storage is empty', async () => {
    const storage = {
      get: vi.fn(async () => ({})),
    };

    await expect(getDaemonEndpointConfig(storage as any)).resolves.toEqual({
      host: DEFAULT_DAEMON_HOST,
      port: DEFAULT_DAEMON_PORT,
    });
  });

  it('uses stored host and port when present', async () => {
    const storage = {
      get: vi.fn(async () => ({ daemonHost: '192.168.1.8', daemonPort: 29999 })),
    };

    await expect(getDaemonEndpointConfig(storage as any)).resolves.toEqual({
      host: '192.168.1.8',
      port: 29999,
    });
  });

  it('ignores invalid stored values', async () => {
    const storage = {
      get: vi.fn(async () => ({ daemonHost: '', daemonPort: 'abc' })),
    };

    await expect(getDaemonEndpointConfig(storage as any)).resolves.toEqual({
      host: DEFAULT_DAEMON_HOST,
      port: DEFAULT_DAEMON_PORT,
    });
  });

  it('builds ping and websocket urls from the endpoint config', () => {
    expect(buildDaemonUrls({ host: 'daemon.internal', port: 28888 })).toEqual({
      pingUrl: 'http://daemon.internal:28888/ping',
      wsUrl: 'ws://daemon.internal:28888/ext',
    });
  });
});
