import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  fetchDaemonStatusMock,
  requestDaemonShutdownMock,
} = vi.hoisted(() => ({
  fetchDaemonStatusMock: vi.fn(),
  requestDaemonShutdownMock: vi.fn(),
}));

vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    dim: (s: string) => s,
  },
}));

vi.mock('../browser/daemon-client.js', () => ({
  fetchDaemonStatus: fetchDaemonStatusMock,
  requestDaemonShutdown: requestDaemonShutdownMock,
}));

import { daemonStop } from './daemon.js';

describe('daemonStop', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchDaemonStatusMock.mockReset();
    requestDaemonShutdownMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports "not running" when daemon is unreachable', async () => {
    fetchDaemonStatusMock.mockResolvedValue(null);

    await daemonStop();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not running'));
  });

  it('sends shutdown and reports success', async () => {
    fetchDaemonStatusMock.mockResolvedValue({
      ok: true,
      pid: 12345,
      uptime: 100,
      extensionConnected: true,
      pending: 0,
      memoryMB: 50,
      port: 19825,
    });
    requestDaemonShutdownMock.mockResolvedValue(true);

    await daemonStop();

    expect(requestDaemonShutdownMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Daemon stopped'));
  });

  it('reports failure when shutdown request fails', async () => {
    fetchDaemonStatusMock.mockResolvedValue({
      ok: true,
      pid: 12345,
      uptime: 100,
      extensionConnected: true,
      pending: 0,
      memoryMB: 50,
      port: 19825,
    });
    requestDaemonShutdownMock.mockResolvedValue(false);

    await daemonStop();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to stop daemon'));
  });
});
