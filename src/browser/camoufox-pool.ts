/**
 * CamoufoxPool — Global singleton for shared Camoufox browser/context.
 *
 * Solves the context isolation problem: LiveSyncService and CamoufoxBridge
 * must share the same BrowserContext so that cookies synced in real-time
 * are visible to adapter pages.
 *
 * Usage pattern:
 *   const ctx = await CamoufoxPool.acquire(wsEndpoint);
 *   const page = await ctx.newPage();
 *   // ... use page ...
 *   // Don't close context — pool manages lifecycle
 */

import { firefox } from 'playwright-core';
import type { Browser, BrowserContext } from 'playwright-core';

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;
let _wsEndpoint: string | null = null;
let _refCount = 0;

/**
 * Acquire the shared Camoufox context. Creates browser/context on first call,
 * reuses on subsequent calls. Increments reference count.
 */
export async function acquire(wsEndpoint: string, opts?: { timeout?: number }): Promise<BrowserContext> {
  // If already connected to a different endpoint, close old connection
  if (_browser && _wsEndpoint !== wsEndpoint) {
    await release(true);
  }

  if (!_browser || !_context) {
    const timeoutMs = (opts?.timeout ?? 30) * 1000;
    _browser = await firefox.connect(wsEndpoint, { timeout: timeoutMs });
    _context = await _browser.newContext();
    _wsEndpoint = wsEndpoint;

    // Handle browser disconnect
    _browser.on('disconnected', () => {
      _browser = null;
      _context = null;
      _wsEndpoint = null;
      _refCount = 0;
    });
  }

  _refCount++;
  return _context;
}

/**
 * Release a reference to the pool. When all references are released,
 * optionally close the context (default: keep alive for future use).
 * Pass force=true to close immediately regardless of refcount.
 */
export async function release(force = false): Promise<void> {
  _refCount = Math.max(0, _refCount - 1);

  if (force || _refCount === 0) {
    try {
      await _context?.close();
    } catch { /* already closed */ }
    _context = null;
    // Don't close browser — camoufox server manages its lifecycle
    _browser = null;
    _wsEndpoint = null;
    _refCount = 0;
  }
}

/** Get the current shared context without incrementing refcount (for inspection). */
export function getContext(): BrowserContext | null {
  return _context;
}

/** Check if pool has an active connection. */
export function isConnected(): boolean {
  return _browser !== null && _context !== null;
}

/** Get connection info. */
export function getInfo(): { wsEndpoint: string | null; refCount: number; connected: boolean } {
  return {
    wsEndpoint: _wsEndpoint,
    refCount: _refCount,
    connected: isConnected(),
  };
}
