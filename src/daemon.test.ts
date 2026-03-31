import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleManager } from './idle-manager.js';

describe('IdleManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not start timer when extension is connected', () => {
    const exit = vi.fn();
    const mgr = new IdleManager(300_000, exit);

    mgr.setExtensionConnected(true);
    mgr.onCliRequest();

    vi.advanceTimersByTime(300_000 + 1000);
    expect(exit).not.toHaveBeenCalled();
  });

  it('starts timer when extension disconnects and CLI is idle', () => {
    const exit = vi.fn();
    const mgr = new IdleManager(300_000, exit);

    mgr.onCliRequest();
    mgr.setExtensionConnected(true);
    mgr.setExtensionConnected(false);

    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300_000 + 1000);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('exits immediately on extension disconnect if CLI has been idle past timeout', () => {
    const exit = vi.fn();
    const mgr = new IdleManager(300_000, exit);

    mgr.onCliRequest();
    mgr.setExtensionConnected(true); // connect before timeout elapses
    vi.advanceTimersByTime(400_000); // CLI idle time exceeds timeout, but extension is connected so no exit

    expect(exit).not.toHaveBeenCalled();

    mgr.setExtensionConnected(false); // disconnect → should exit immediately since CLI idle > timeout

    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('resets timer on new CLI request', () => {
    const exit = vi.fn();
    const mgr = new IdleManager(300_000, exit);

    mgr.onCliRequest();
    vi.advanceTimersByTime(200_000);
    mgr.onCliRequest();

    vi.advanceTimersByTime(200_000);
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100_001);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('does not exit when timeout is 0 (disabled)', () => {
    const exit = vi.fn();
    const mgr = new IdleManager(0, exit);

    mgr.onCliRequest();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(exit).not.toHaveBeenCalled();
  });

  it('clears timer when extension connects', () => {
    const exit = vi.fn();
    const mgr = new IdleManager(300_000, exit);

    mgr.onCliRequest();
    vi.advanceTimersByTime(200_000);

    mgr.setExtensionConnected(true);
    vi.advanceTimersByTime(200_000);
    expect(exit).not.toHaveBeenCalled();
  });
});
