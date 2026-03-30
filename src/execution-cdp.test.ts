import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cli, Strategy } from './registry.js';

const mockCheckDaemonStatus = vi.fn();
const mockBrowserSession = vi.fn();

vi.mock('./browser/discover.js', () => ({
  checkDaemonStatus: mockCheckDaemonStatus,
}));

vi.mock('./runtime.js', async () => {
  const actual = await vi.importActual<typeof import('./runtime.js')>('./runtime.js');
  return {
    ...actual,
    browserSession: mockBrowserSession,
  };
});

describe('executeCommand with OPENCLI_CDP_ENDPOINT', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockCheckDaemonStatus.mockReset();
    mockBrowserSession.mockReset();
  });

  it('does not fail fast on Browser Bridge status when CDP mode is enabled', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/browser/browser-1');
    mockCheckDaemonStatus.mockResolvedValue({ running: true, extensionConnected: false });
    mockBrowserSession.mockImplementation(async (_factory, fn) => fn({} as any));

    const { executeCommand } = await import('./execution.js');
    const cmd = cli({
      site: 'test-execution',
      name: 'cdp-browser-command',
      description: 'test cdp browser execution path',
      strategy: Strategy.COOKIE,
      domain: 'www.xiaohongshu.com',
      func: async () => 'ok',
    });

    await expect(executeCommand(cmd, {})).resolves.toBe('ok');
    expect(mockBrowserSession).toHaveBeenCalledTimes(1);
  });
});
