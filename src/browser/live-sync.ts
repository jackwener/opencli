/**
 * Live state sync service: Chrome → Camoufox.
 *
 * Three-phase approach:
 *   1. Initial full sync: export-state from Chrome → import-state to Camoufox
 *   2. Real-time watch: subscribe to daemon /sync WS for cookie changes
 *   3. Debounced batching: accumulate changes over 50ms windows, apply in bulk
 *
 * Uses CamoufoxPool for shared context — adapters see the same cookies.
 */

import { WebSocket } from 'ws';
import type { BrowserContext } from 'playwright-core';
import * as CamoufoxPool from './camoufox-pool.js';

export interface SyncServiceOptions {
  /** Daemon WebSocket URL base (default: ws://127.0.0.1:19825) */
  daemonUrl?: string;
  /** Camoufox WebSocket endpoint */
  camoufoxWs: string;
  /** Domains to watch (empty = all) */
  domains?: string[];
  /** Skip initial full sync (only watch changes) */
  skipInitialSync?: boolean;
  /** Callback on each synced event */
  onSync?: (event: SyncEvent) => void;
  /** Callback on initial sync complete */
  onInitialSync?: (stats: { cookies: number; localStorage: number }) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

interface SyncEvent {
  type: 'state-change';
  changeType: 'cookie' | 'localStorage' | 'sessionStorage';
  domain: string;
  cookie?: {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expirationDate?: number;
    removed: boolean;
    cause?: string;
  };
  storage?: {
    key: string;
    newValue: string | null;
    oldValue: string | null;
    storageArea: 'localStorage' | 'sessionStorage';
    url: string;
  };
  timestamp: number;
}

/** Pending cookie change for batching */
interface PendingCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: number;
  removed: boolean;
}

export class LiveSyncService {
  private daemonWs: WebSocket | null = null;
  private context: BrowserContext | null = null;
  private running = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stats = { cookies: 0, storage: 0, errors: 0, initialSync: false };

  // Debounce batching
  private pendingCookies: PendingCookie[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_WINDOW_MS = 50;

  constructor(private readonly opts: SyncServiceOptions) {}

  async start(): Promise<void> {
    this.running = true;

    // Acquire shared context from pool
    this.context = await CamoufoxPool.acquire(this.opts.camoufoxWs);

    // Phase 1: Initial full sync (unless skipped)
    if (!this.opts.skipInitialSync) {
      await this.initialSync();
    }

    // Phase 2: Start real-time watch
    this.connectToDaemon();
    await this.sendWatchCommand();
  }

  async stop(): Promise<void> {
    this.running = false;

    await this.sendUnwatchCommand().catch(() => {});

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.daemonWs?.close();
    this.daemonWs = null;

    // Release pool reference (don't force-close — other users may hold refs)
    await CamoufoxPool.release();
    this.context = null;
  }

  getStats() { return { ...this.stats }; }

  // ── Phase 1: Initial full sync ───────────────────────────────────────

  private async initialSync(): Promise<void> {
    const daemonHttp = this.getDaemonHttp();

    // Export state from Chrome via daemon
    const domains = this.opts.domains ?? [];
    const domain = domains[0]; // Use first domain for navigation

    const exportBody = JSON.stringify({
      id: `init-export-${Date.now()}`,
      action: 'export-state',
      ...(domain ? { domain } : {}),
    });

    const exportResp = await fetch(`${daemonHttp}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: exportBody,
    });
    const exportResult = await exportResp.json() as { ok: boolean; data?: any; error?: string };

    if (!exportResult.ok) {
      this.opts.onError?.(new Error(`Initial export failed: ${exportResult.error}`));
      return;
    }

    const state = exportResult.data;
    if (!state || !this.context) return;

    // Import cookies to camoufox context
    if (state.cookies?.length) {
      const pwCookies = state.cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: c.secure ?? false,
        httpOnly: c.httpOnly ?? false,
        expires: c.expirationDate ?? -1,
      }));
      await this.context.addCookies(pwCookies);
    }

    // Import localStorage — need a page on the target domain
    if (state.localStorage && Object.keys(state.localStorage).length > 0 && state.url) {
      let tempPage;
      try {
        tempPage = await this.context.newPage();
        await tempPage.goto(state.url, { waitUntil: 'load', timeout: 15000 });
        const entries = JSON.stringify(state.localStorage);
        await tempPage.evaluate(`(() => { const e = ${entries}; for (const [k,v] of Object.entries(e)) window.localStorage.setItem(k,v); })()`);
      } catch { /* non-critical */ }
      finally {
        try { await tempPage?.close(); } catch {}
      }
    }

    this.stats.initialSync = true;
    this.opts.onInitialSync?.({
      cookies: state.cookies?.length ?? 0,
      localStorage: Object.keys(state.localStorage ?? {}).length,
    });
  }

  // ── Phase 2: Real-time watch ─────────────────────────────────────────

  private connectToDaemon(): void {
    const base = this.opts.daemonUrl ?? 'ws://127.0.0.1:19825';
    const syncUrl = `${base}/sync`;

    this.daemonWs = new WebSocket(syncUrl);

    this.daemonWs.on('message', (data) => {
      try {
        const event: SyncEvent = JSON.parse(data.toString());
        if (event.type === 'state-change') {
          this.handleSyncEvent(event);
        }
      } catch { /* ignore malformed */ }
    });

    this.daemonWs.on('close', () => {
      if (this.running) {
        this.reconnectTimer = setTimeout(() => this.connectToDaemon(), 2000);
      }
    });

    this.daemonWs.on('error', () => { /* triggers close */ });
  }

  // ── Phase 3: Debounced batching ──────────────────────────────────────

  private handleSyncEvent(event: SyncEvent): void {
    if (event.changeType === 'cookie' && event.cookie) {
      // Accumulate in batch
      this.pendingCookies.push({
        name: event.cookie.name,
        value: event.cookie.removed ? '' : event.cookie.value,
        domain: event.cookie.domain,
        path: event.cookie.path,
        secure: event.cookie.secure,
        httpOnly: event.cookie.httpOnly,
        expires: event.cookie.removed ? 0 : (event.cookie.expirationDate ?? -1),
        removed: event.cookie.removed,
      });

      // Schedule batch flush
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flushCookieBatch(), this.BATCH_WINDOW_MS);
      }

      this.opts.onSync?.(event);
    }

    if (event.changeType === 'localStorage' && event.storage) {
      this.handleStorageEvent(event).catch(err => {
        this.stats.errors++;
        this.opts.onError?.(err);
      });
      this.opts.onSync?.(event);
    }
  }

  private async flushCookieBatch(): Promise<void> {
    this.batchTimer = null;
    if (!this.context || this.pendingCookies.length === 0) return;

    const batch = this.pendingCookies.splice(0);

    // Deduplicate: keep last change per name+domain+path
    const deduped = new Map<string, PendingCookie>();
    for (const c of batch) {
      deduped.set(`${c.name}|${c.domain}|${c.path}`, c);
    }

    const cookies = [...deduped.values()].map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      expires: c.expires,
    }));

    try {
      await this.context.addCookies(cookies);
      this.stats.cookies += cookies.length;
    } catch (err) {
      this.stats.errors++;
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async handleStorageEvent(event: SyncEvent): Promise<void> {
    if (!this.context || !event.storage) return;

    const pages = this.context.pages();
    for (const page of pages) {
      try {
        const pageUrl = page.url();
        if (!pageUrl.includes(event.domain)) continue;
        if (event.storage.newValue !== null) {
          await page.evaluate(`window.localStorage.setItem(${JSON.stringify(event.storage.key)}, ${JSON.stringify(event.storage.newValue)})`);
        } else {
          await page.evaluate(`window.localStorage.removeItem(${JSON.stringify(event.storage.key)})`);
        }
        this.stats.storage++;
      } catch { /* page might be navigating */ }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private getDaemonHttp(): string {
    return (this.opts.daemonUrl ?? 'ws://127.0.0.1:19825').replace('ws://', 'http://');
  }

  private async sendWatchCommand(): Promise<void> {
    const body = JSON.stringify({
      id: `watch-${Date.now()}`,
      action: 'watch-state',
      domains: this.opts.domains ?? [],
    });
    const resp = await fetch(`${this.getDaemonHttp()}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const result = await resp.json() as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(`watch-state failed: ${result.error}`);
  }

  private async sendUnwatchCommand(): Promise<void> {
    const body = JSON.stringify({
      id: `unwatch-${Date.now()}`,
      action: 'unwatch-state',
    });
    await fetch(`${this.getDaemonHttp()}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  }
}
