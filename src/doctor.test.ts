import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckDaemonStatus, mockListSessions, mockConnect, mockClose } = vi.hoisted(() => ({
  mockCheckDaemonStatus: vi.fn(),
  mockListSessions: vi.fn(),
  mockConnect: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock('./browser/discover.js', () => ({
  checkDaemonStatus: mockCheckDaemonStatus,
}));

vi.mock('./browser/daemon-client.js', () => ({
  listSessions: mockListSessions,
}));

vi.mock('./browser/index.js', () => ({
  BrowserBridge: class {
    connect = mockConnect;
    close = mockClose;
  },
}));

import { renderBrowserDoctorReport, runBrowserDoctor } from './doctor.js';

describe('doctor report rendering', () => {
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders OK-style report when daemon and extension connected', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: true,
      issues: [],
    }));

    expect(text).toContain('[OK] Daemon: running on port 19825');
    expect(text).toContain('[OK] Extension: connected');
    expect(text).toContain('Everything looks good!');
  });

  it('renders MISSING when daemon not running', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: false,
      extensionConnected: false,
      issues: ['Daemon is not running.'],
    }));

    expect(text).toContain('[MISSING] Daemon: not running');
    expect(text).toContain('[MISSING] Extension: not connected');
    expect(text).toContain('Daemon is not running.');
  });

  it('renders extension not connected when daemon is running', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: false,
      issues: ['Daemon is running but the Chrome extension is not connected.'],
    }));

    expect(text).toContain('[OK] Daemon: running on port 19825');
    expect(text).toContain('[MISSING] Extension: not connected');
  });

  it('renders connectivity OK when live test succeeds', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: true,
      connectivity: { ok: true, durationMs: 1234 },
      issues: [],
    }));

    expect(text).toContain('[OK] Connectivity: connected in 1.2s');
  });

  it('renders connectivity SKIP when not tested', () => {
    const text = strip(renderBrowserDoctorReport({
      daemonRunning: true,
      extensionConnected: true,
      issues: [],
    }));

    expect(text).toContain('[SKIP] Connectivity: skipped (--no-live)');
  });

  it('reports consistent status when live check auto-starts the daemon', async () => {
    // checkDaemonStatus is called twice: once for auto-start check, once for final status.
    // First call: daemon not running (triggers auto-start attempt)
    mockCheckDaemonStatus.mockResolvedValueOnce({ running: false, extensionConnected: false });
    // Auto-start attempt via BrowserBridge.connect fails
    mockConnect.mockRejectedValueOnce(new Error('Could not start daemon'));
    // Second call: daemon still not running after failed auto-start
    mockCheckDaemonStatus.mockResolvedValueOnce({ running: false, extensionConnected: false });

    const report = await runBrowserDoctor({ live: false });

    // Status reflects daemon not running
    expect(report.daemonRunning).toBe(false);
    expect(report.extensionConnected).toBe(false);
    // checkDaemonStatus called twice (initial + final)
    expect(mockCheckDaemonStatus).toHaveBeenCalledTimes(2);
    // Should report daemon not running
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('Daemon is not running'),
    ]));
  });
});
