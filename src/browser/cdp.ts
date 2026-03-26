/**
 * CDP client — implements IPage by connecting directly to a Chrome/Electron CDP WebSocket.
 *
 * Fixes applied:
 * - send() now has a 30s timeout guard (P0 #4)
 * - goto() waits for Page.loadEventFired instead of hardcoded 1s sleep (P1 #3)
 * - Implemented scroll, autoScroll, screenshot, networkRequests (P1 #2)
 * - Shared DOM helper methods extracted to reduce duplication with Page (P1 #5)
 */

import { WebSocket, type RawData } from 'ws';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BrowserCookie, IPage, ScreenshotOptions, SnapshotOptions, WaitOptions } from '../types.js';
import { wrapForEval } from './utils.js';
import { generateSnapshotJs, scrollToRefJs, getFormStateJs } from './dom-snapshot.js';
import { generateStealthJs } from './stealth.js';
import {
  clickJs,
  typeTextJs,
  pressKeyJs,
  waitForTextJs,
  scrollJs,
  autoScrollJs,
  networkRequestsJs,
  waitForDomStableJs,
} from './dom-helpers.js';

export interface CDPTarget {
  targetId?: string;
  type?: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
}

interface RuntimeEvaluateResult {
  result?: {
    value?: unknown;
  };
  exceptionDetails?: {
    exception?: {
      description?: string;
    };
  };
}

const CDP_SEND_TIMEOUT = 30_000; // 30s per command
const CDP_CLOSE_TIMEOUT = 1_500;
const PERSISTENT_TARGET_REGISTRY_PATH = path.join(os.tmpdir(), 'opencli-cdp-targets.json');

export class CDPBridge {
  private _ws: WebSocket | null = null;
  private _sessionId: string | null = null;
  private _ownedTargetId: string | null = null;
  private _closeOwnedTargetOnClose = false;
  private _idCounter = 0;
  private _pending = new Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private _eventListeners = new Map<string, Set<(params: unknown) => void>>();

  async connect(opts?: { timeout?: number; workspace?: string }): Promise<IPage> {
    if (this._ws) throw new Error('CDPBridge is already connected. Call close() before reconnecting.');

    const endpoint = process.env.OPENCLI_CDP_ENDPOINT;
    if (!endpoint) throw new Error('OPENCLI_CDP_ENDPOINT is not set');

    const connection = await resolveConnectionEndpoint(endpoint);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(connection.wsUrl);
      const timeoutMs = (opts?.timeout ?? 10) * 1000; // opts.timeout is in seconds
      const timeout = setTimeout(() => reject(new Error('CDP connect timeout')), timeoutMs);

      ws.on('open', async () => {
        try {
          clearTimeout(timeout);
          this._ws = ws;
          if (connection.browserLevel) {
            await this.attachToBrowserTarget({
              preferNewTarget: connection.preferNewTarget,
              workspace: normalizeWorkspaceKey(opts?.workspace),
              endpointKey: endpoint,
            });
          }
        } catch (err) {
          await this.close().catch(() => {});
          reject(err);
          return;
        }

        try {
          // Register stealth script to run before any page JS on every navigation.
          await this.send('Page.enable');
          await this.send('Page.addScriptToEvaluateOnNewDocument', { source: generateStealthJs() });
        } catch {
          // Non-fatal: stealth is best-effort
        }
        resolve(new CDPPage(this));
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('message', (data: RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          // Handle command responses
          if (msg.id && this._pending.has(msg.id)) {
            const entry = this._pending.get(msg.id)!;
            clearTimeout(entry.timer);
            this._pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(msg.error.message));
            } else {
              entry.resolve(msg.result);
            }
          }
          // Handle CDP events
          if (msg.method) {
            if (this._sessionId && msg.sessionId && msg.sessionId !== this._sessionId) {
              return;
            }
            const listeners = this._eventListeners.get(msg.method);
            if (listeners) {
              for (const fn of listeners) fn(msg.params);
            }
          }
        } catch {
          // ignore parsing errors
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this._ownedTargetId && this._closeOwnedTargetOnClose && this._ws && this._ws.readyState === WebSocket.OPEN) {
      await this.send('Target.closeTarget', { targetId: this._ownedTargetId }, CDP_CLOSE_TIMEOUT, { root: true }).catch(() => {});
    }
    this._ownedTargetId = null;
    this._closeOwnedTargetOnClose = false;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._sessionId = null;
    for (const p of this._pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('CDP connection closed'));
    }
    this._pending.clear();
    this._eventListeners.clear();
    this._idCounter = 0;
  }

  /** Send a CDP command with timeout guard (P0 fix #4) */
  async send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = CDP_SEND_TIMEOUT,
    opts: { root?: boolean } = {},
  ): Promise<unknown> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error('CDP connection is not open');
    }
    const id = ++this._idCounter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP command '${method}' timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      const payload: Record<string, unknown> = { id, method, params };
      if (this._sessionId && !opts.root) {
        payload.sessionId = this._sessionId;
      }
      this._ws!.send(JSON.stringify(payload));
    });
  }

  /** Listen for a CDP event */
  on(event: string, handler: (params: unknown) => void): void {
    let set = this._eventListeners.get(event);
    if (!set) { set = new Set(); this._eventListeners.set(event, set); }
    set.add(handler);
  }

  /** Remove a CDP event listener */
  off(event: string, handler: (params: unknown) => void): void {
    this._eventListeners.get(event)?.delete(handler);
  }

  /** Wait for a CDP event to fire (one-shot) */
  waitForEvent(event: string, timeoutMs: number = 15_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, handler);
        reject(new Error(`Timed out waiting for CDP event '${event}'`));
      }, timeoutMs);
      const handler = (params: unknown) => {
        clearTimeout(timer);
        this.off(event, handler);
        resolve(params);
      };
      this.on(event, handler);
    });
  }

  private async attachToBrowserTarget(opts: { preferNewTarget: boolean; workspace?: string; endpointKey: string }): Promise<void> {
    let targetId: string | undefined;
    const targetInfos = await this.listBrowserTargets();

    if (hasExplicitTargetHint()) {
      const hintedTarget = selectBrowserAttachTarget(targetInfos);
      targetId = hintedTarget?.targetId;
      if (targetId && opts.workspace) {
        setPersistentTargetId(opts.endpointKey, opts.workspace, targetId);
      }
    } else if (opts.workspace) {
      const storedTargetId = getPersistentTargetId(opts.endpointKey, opts.workspace);
      const storedTarget = selectTargetById(targetInfos, storedTargetId);
      if (storedTarget?.targetId) {
        targetId = storedTarget.targetId;
      } else if (storedTargetId) {
        clearPersistentTargetId(opts.endpointKey, opts.workspace);
      }
    }

    if (!targetId && opts.preferNewTarget) {
      const created = await this.send('Target.createTarget', { url: 'about:blank' }, CDP_SEND_TIMEOUT, { root: true });
      targetId = isRecord(created) && typeof created.targetId === 'string' ? created.targetId : undefined;
      if (targetId) {
        this._ownedTargetId = targetId;
        this._closeOwnedTargetOnClose = !opts.workspace;
        if (opts.workspace) {
          setPersistentTargetId(opts.endpointKey, opts.workspace, targetId);
        }
      }
    }

    if (!targetId) {
      const target = selectBrowserAttachTarget(targetInfos);
      targetId = target?.targetId;
    }

    if (!targetId) {
      throw new Error('No inspectable targets found at CDP endpoint');
    }

    await this.send('Target.activateTarget', { targetId }, CDP_SEND_TIMEOUT, { root: true }).catch(() => {});
    const attachResult = await this.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    }, CDP_SEND_TIMEOUT, { root: true });
    const sessionId = isRecord(attachResult) ? attachResult.sessionId : undefined;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error(`Failed to attach to CDP target '${targetId}'`);
    }
    this._sessionId = sessionId;
  }

  private async listBrowserTargets(): Promise<CDPTarget[]> {
    const result = await this.send('Target.getTargets', {}, CDP_SEND_TIMEOUT, { root: true });
    return isRecord(result) && Array.isArray(result.targetInfos)
      ? result.targetInfos as CDPTarget[]
      : [];
  }
}

class CDPPage implements IPage {
  private _pageEnabled = false;
  constructor(private bridge: CDPBridge) {}

  /** Navigate with proper load event waiting (P1 fix #3) */
  async goto(url: string, options?: { waitUntil?: 'load' | 'none'; settleMs?: number }): Promise<void> {
    if (!this._pageEnabled) {
      await this.bridge.send('Page.enable');
      this._pageEnabled = true;
    }
    const loadPromise = this.bridge.waitForEvent('Page.loadEventFired', 30_000);
    // Guard the event wait immediately so a navigation transport failure does not
    // leave a late unhandled rejection behind.
    void loadPromise.catch(() => {});
    const navigateResult = await this.bridge.send('Page.navigate', { url });
    const navigationError = isRecord(navigateResult) && typeof navigateResult.errorText === 'string'
      ? navigateResult.errorText.trim()
      : '';
    if (navigationError) {
      throw new Error(`Navigation failed for ${url}: ${navigationError}`);
    }
    try {
      await loadPromise;
    } catch (error) {
      logVerbose(`[cdp] Timed out waiting for Page.loadEventFired after navigating to ${url}`, normalizeError(error));
      // Do not fail on load timeout alone; SPAs and long-polling pages may never emit a clean load event.
    }
    // Smart settle: use DOM stability detection instead of fixed sleep.
    // settleMs is now a timeout cap (default 1000ms), not a fixed wait.
    if (options?.waitUntil !== 'none') {
      const maxMs = options?.settleMs ?? 1000;
      await this.evaluate(waitForDomStableJs(maxMs, Math.min(500, maxMs)));
    }
  }

  async evaluate(js: string): Promise<unknown> {
    const expression = wrapForEval(js);
    const result = await this.bridge.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }) as RuntimeEvaluateResult;
    if (result.exceptionDetails) {
      throw new Error('Evaluate error: ' + (result.exceptionDetails.exception?.description || 'Unknown exception'));
    }
    return result.result?.value;
  }

  async getCookies(opts: { domain?: string; url?: string } = {}): Promise<BrowserCookie[]> {
    const result = await this.bridge.send('Network.getCookies', opts.url ? { urls: [opts.url] } : {});
    const cookies = isRecord(result) && Array.isArray(result.cookies) ? result.cookies : [];
    const domain = opts.domain;
    return domain
      ? cookies.filter((cookie): cookie is BrowserCookie => isCookie(cookie) && matchesCookieDomain(cookie.domain, domain))
      : cookies;
  }

  async snapshot(opts: SnapshotOptions = {}): Promise<unknown> {
    const snapshotJs = generateSnapshotJs({
      viewportExpand: opts.viewportExpand ?? 800,
      maxDepth: Math.max(1, Math.min(Number(opts.maxDepth) || 50, 200)),
      interactiveOnly: opts.interactive ?? false,
      maxTextLength: opts.maxTextLength ?? 120,
      includeScrollInfo: true,
      bboxDedup: true,
    });
    return this.evaluate(snapshotJs);
  }

  // ── Shared DOM operations (P1 fix #5 — using dom-helpers.ts) ──

  async click(ref: string): Promise<void> {
    await this.evaluate(clickJs(ref));
  }

  async typeText(ref: string, text: string): Promise<void> {
    await this.evaluate(typeTextJs(ref, text));
  }

  async pressKey(key: string): Promise<void> {
    await this.evaluate(pressKeyJs(key));
  }

  async scrollTo(ref: string): Promise<unknown> {
    return this.evaluate(scrollToRefJs(ref));
  }

  async getFormState(): Promise<Record<string, unknown>> {
    return (await this.evaluate(getFormStateJs())) as Record<string, unknown>;
  }

  async wait(options: number | WaitOptions): Promise<void> {
    if (typeof options === 'number') {
      await new Promise(resolve => setTimeout(resolve, options * 1000));
      return;
    }
    if (typeof options.time === 'number') {
      const waitTime = options.time;
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      return;
    }
    if (options.text) {
      const timeout = (options.timeout ?? 30) * 1000;
      await this.evaluate(waitForTextJs(options.text, timeout));
    }
  }

  // ── Implemented methods (P1 fix #2) ──

  async scroll(direction: string = 'down', amount: number = 500): Promise<void> {
    await this.evaluate(scrollJs(direction, amount));
  }

  async autoScroll(options?: { times?: number; delayMs?: number }): Promise<void> {
    const times = options?.times ?? 3;
    const delayMs = options?.delayMs ?? 2000;
    await this.evaluate(autoScrollJs(times, delayMs));
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<string> {
    const result = await this.bridge.send('Page.captureScreenshot', {
      format: options.format ?? 'png',
      quality: options.format === 'jpeg' ? (options.quality ?? 80) : undefined,
      captureBeyondViewport: options.fullPage ?? false,
    });
    const base64 = isRecord(result) && typeof result.data === 'string' ? result.data : '';
    if (options.path) {
      await saveBase64ToFile(base64, options.path);
    }
    return base64;
  }

  async networkRequests(includeStatic: boolean = false): Promise<unknown[]> {
    const result = await this.evaluate(networkRequestsJs(includeStatic));
    return Array.isArray(result) ? result : [];
  }

  async tabs(): Promise<unknown[]> {
    return [];
  }

  async closeTab(_index?: number): Promise<void> {
    // Not supported in direct CDP mode
  }

  async newTab(): Promise<void> {
    await this.bridge.send('Target.createTarget', { url: 'about:blank' }, CDP_SEND_TIMEOUT, { root: true });
  }

  async selectTab(_index: number): Promise<void> {
    // Not supported in direct CDP mode
  }

  async consoleMessages(_level?: string): Promise<unknown[]> {
    return [];
  }

  async installInterceptor(pattern: string): Promise<void> {
    const { generateInterceptorJs } = await import('../interceptor.js');
    await this.evaluate(generateInterceptorJs(JSON.stringify(pattern), {
      arrayName: '__opencli_xhr',
      patchGuard: '__opencli_interceptor_patched',
    }));
  }

  async getInterceptedRequests(): Promise<unknown[]> {
    const { generateReadInterceptedJs } = await import('../interceptor.js');
    const result = await this.evaluate(generateReadInterceptedJs('__opencli_xhr'));
    return Array.isArray(result) ? result : [];
  }
}

import { isRecord, saveBase64ToFile } from '../utils.js';

function isCookie(value: unknown): value is BrowserCookie {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.value === 'string'
    && typeof value.domain === 'string';
}

function matchesCookieDomain(cookieDomain: string, targetDomain: string): boolean {
  const normalizedCookieDomain = cookieDomain.replace(/^\./, '').toLowerCase();
  const normalizedTargetDomain = targetDomain.replace(/^\./, '').toLowerCase();
  return normalizedTargetDomain === normalizedCookieDomain
    || normalizedTargetDomain.endsWith(`.${normalizedCookieDomain}`);
}

async function resolveConnectionEndpoint(
  endpoint: string,
): Promise<{ wsUrl: string; browserLevel: boolean; preferNewTarget: boolean }> {
  if (endpoint === 'auto') {
    const wsUrl = resolveAnyBrowserWebSocketUrl();
    if (!wsUrl) {
      throw new Error('Failed to auto-discover a local browser CDP websocket. Start Chrome with --remote-debugging-port and retry, or set OPENCLI_CDP_ENDPOINT explicitly.');
    }
    return {
      wsUrl,
      browserLevel: true,
      preferNewTarget: shouldPreferNewBrowserTarget(endpoint),
    };
  }

  if (endpoint.startsWith('ws://') || endpoint.startsWith('wss://')) {
    const browserLevel = isBrowserLevelWebSocket(endpoint);
    return {
      wsUrl: endpoint,
      browserLevel,
      preferNewTarget: browserLevel && shouldPreferNewBrowserTarget(endpoint),
    };
  }

  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    return { wsUrl: endpoint, browserLevel: false, preferNewTarget: false };
  }

  const normalized = endpoint.replace(/\/$/, '');
  let discoveryError: Error | undefined;
  let versionError: Error | undefined;

  try {
    const targets = await fetchJsonDirect(`${normalized}/json`) as CDPTarget[];
    const target = selectCDPTarget(targets);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error('No inspectable targets found at CDP endpoint');
    }
    return {
      wsUrl: rewriteBrowserWebSocketUrlForEndpoint(normalized, target.webSocketDebuggerUrl) ?? target.webSocketDebuggerUrl,
      browserLevel: false,
      preferNewTarget: false,
    };
  } catch (error) {
    discoveryError = normalizeError(error);
    logVerbose(`[cdp] Failed to resolve page websocket from ${normalized}/json`, discoveryError);
  }

  try {
    const payload = await fetchJsonDirect(`${normalized}/json/version`);
    const browserWsUrl = rewriteBrowserWebSocketUrlForEndpoint(
      normalized,
      extractBrowserWebSocketUrlFromVersionPayload(payload),
    );
    if (browserWsUrl) {
      return {
        wsUrl: browserWsUrl,
        browserLevel: true,
        preferNewTarget: shouldPreferNewBrowserTarget(endpoint),
      };
    }
  } catch (error) {
    versionError = normalizeError(error);
    logVerbose(`[cdp] Failed to resolve browser websocket from ${normalized}/json/version`, versionError);
  }

  const browserWsUrl = resolveBrowserWebSocketUrl(normalized);
  if (browserWsUrl) {
    return {
      wsUrl: browserWsUrl,
      browserLevel: true,
      preferNewTarget: shouldPreferNewBrowserTarget(endpoint),
    };
  }

  const detail = [discoveryError?.message, versionError?.message].filter(Boolean).join('; ');
  throw new Error(detail
    ? `Failed to resolve an inspectable target from CDP endpoint (${detail})`
    : 'Failed to resolve an inspectable target from CDP endpoint');
}

function resolveBrowserWebSocketUrl(endpoint: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!isLoopbackHost(host)) return null;
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');

  for (const filePath of getDevToolsActivePortCandidates()) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const wsUrl = parseBrowserWebSocketUrlFromActivePort(port, host, content);
      if (wsUrl) return wsUrl;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function resolveAnyBrowserWebSocketUrl(host: string = '127.0.0.1'): string | null {
  for (const filePath of getDevToolsActivePortCandidates()) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const wsUrl = parseAnyBrowserWebSocketUrlFromActivePort(content, host);
      if (wsUrl) return wsUrl;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function parseBrowserWebSocketUrlFromActivePort(port: string, host: string, content: string): string | null {
  const lines = content.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  if (lines[0] !== port) return null;
  if (!lines[1].startsWith('/devtools/browser/')) return null;
  return `ws://${formatHostForUrl(host)}:${port}${lines[1]}`;
}

function parseAnyBrowserWebSocketUrlFromActivePort(content: string, host: string): string | null {
  const lines = content.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  if (!/^\d+$/.test(lines[0])) return null;
  if (!lines[1].startsWith('/devtools/browser/')) return null;
  return `ws://${formatHostForUrl(host)}:${lines[0]}${lines[1]}`;
}

function getDevToolsActivePortCandidates(): string[] {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'DevToolsActivePort'));
    candidates.push(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'DevToolsActivePort'));
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'DevToolsActivePort'));
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'DevToolsActivePort'));
  } else {
    candidates.push(path.join(os.homedir(), '.config', 'google-chrome', 'DevToolsActivePort'));
    candidates.push(path.join(os.homedir(), '.config', 'chromium', 'DevToolsActivePort'));
    candidates.push(path.join(os.homedir(), '.config', 'microsoft-edge', 'DevToolsActivePort'));
  }
  return candidates;
}

function isBrowserLevelWebSocket(endpoint: string): boolean {
  return endpoint.includes('/devtools/browser/');
}

function shouldPreferNewBrowserTarget(endpoint: string): boolean {
  return endpoint === 'auto' && !process.env.OPENCLI_CDP_TARGET?.trim();
}

function normalizeWorkspaceKey(workspace?: string): string | undefined {
  const trimmed = workspace?.trim();
  return trimmed ? trimmed : undefined;
}

function makePersistentTargetRegistryKey(endpointKey: string, workspace: string): string {
  return `${endpointKey}::${workspace}`;
}

function readPersistentTargetRegistry(): Record<string, string> {
  try {
    const raw = fs.readFileSync(PERSISTENT_TARGET_REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function writePersistentTargetRegistry(registry: Record<string, string>): void {
  try {
    fs.writeFileSync(PERSISTENT_TARGET_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
  } catch {
    // Best-effort cache only.
  }
}

function getPersistentTargetId(endpointKey: string, workspace: string): string | undefined {
  const registry = readPersistentTargetRegistry();
  return registry[makePersistentTargetRegistryKey(endpointKey, workspace)];
}

function setPersistentTargetId(endpointKey: string, workspace: string, targetId: string): void {
  const registry = readPersistentTargetRegistry();
  registry[makePersistentTargetRegistryKey(endpointKey, workspace)] = targetId;
  writePersistentTargetRegistry(registry);
}

function clearPersistentTargetId(endpointKey: string, workspace: string): void {
  const registry = readPersistentTargetRegistry();
  delete registry[makePersistentTargetRegistryKey(endpointKey, workspace)];
  writePersistentTargetRegistry(registry);
}

function selectTargetById(targets: CDPTarget[], targetId?: string): CDPTarget | undefined {
  if (!targetId) return undefined;
  return targets.find((target) => target.targetId === targetId && isBrowserAttachableTarget(target));
}

function isLoopbackHost(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
}

function formatHostForUrl(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function extractBrowserWebSocketUrlFromVersionPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const wsUrl = payload.webSocketDebuggerUrl;
  return typeof wsUrl === 'string' && isBrowserLevelWebSocket(wsUrl) ? wsUrl : null;
}

function rewriteBrowserWebSocketUrlForEndpoint(endpoint: string, wsUrl: string | null): string | null {
  if (!wsUrl) return null;

  let endpointUrl: URL;
  let browserWsUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
    browserWsUrl = new URL(wsUrl);
  } catch {
    return wsUrl;
  }

  if (isLoopbackHost(endpointUrl.hostname.toLowerCase())) return wsUrl;
  if (!isLoopbackHost(browserWsUrl.hostname.toLowerCase())) return wsUrl;

  browserWsUrl.protocol = endpointUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  browserWsUrl.hostname = endpointUrl.hostname;
  browserWsUrl.port = endpointUrl.port;
  browserWsUrl.username = endpointUrl.username;
  browserWsUrl.password = endpointUrl.password;
  return browserWsUrl.toString();
}

function isBrowserAttachableTarget(target: CDPTarget): boolean {
  const type = (target.type ?? '').toLowerCase();
  if (!type) return true;
  return ['page', 'app', 'webview', 'iframe'].includes(type);
}

function selectBrowserAttachTarget(targets: CDPTarget[]): CDPTarget | undefined {
  return selectCDPTarget(targets.filter(isBrowserAttachableTarget));
}

// ── CDP target selection (unchanged) ──

function selectCDPTarget(targets: CDPTarget[]): CDPTarget | undefined {
  const preferredPattern = compilePreferredPattern(process.env.OPENCLI_CDP_TARGET);

  const ranked = targets
    .map((target, index) => ({ target, index, score: scoreCDPTarget(target, preferredPattern) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

  return ranked[0]?.target;
}

function scoreCDPTarget(target: CDPTarget, preferredPattern?: RegExp): number {
  if (!target.webSocketDebuggerUrl && !target.targetId) return Number.NEGATIVE_INFINITY;

  const type = (target.type ?? '').toLowerCase();
  const url = (target.url ?? '').toLowerCase();
  const title = (target.title ?? '').toLowerCase();
  const haystack = `${title} ${url}`;

  if (!haystack.trim() && !type) return Number.NEGATIVE_INFINITY;
  if (haystack.includes('devtools')) return Number.NEGATIVE_INFINITY;

  let score = 0;

  if (preferredPattern && preferredPattern.test(haystack)) score += 1000;

  if (type === 'app') score += 120;
  else if (type === 'webview') score += 100;
  else if (type === 'page') score += 80;
  else if (type === 'iframe') score += 20;

  if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) score += 90;
  if (url.startsWith('file://')) score += 60;
  if (url.startsWith('http://127.0.0.1') || url.startsWith('https://127.0.0.1')) score += 50;
  if (url.startsWith('about:blank')) score -= 120;
  if (url === '' || url === 'about:blank') score -= 40;

  if (title && title !== 'devtools') score += 25;
  if (title.includes('antigravity')) score += 120;
  if (title.includes('codex')) score += 120;
  if (title.includes('cursor')) score += 120;
  if (title.includes('chatwise')) score += 120;
  if (title.includes('notion')) score += 120;
  if (title.includes('discord')) score += 120;

  if (url.includes('antigravity')) score += 100;
  if (url.includes('codex')) score += 100;
  if (url.includes('cursor')) score += 100;
  if (url.includes('chatwise')) score += 100;
  if (url.includes('notion')) score += 100;
  if (url.includes('discord')) score += 100;

  return score;
}

function compilePreferredPattern(raw: string | undefined): RegExp | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return new RegExp(escapeRegExp(value.toLowerCase()));
}

function hasExplicitTargetHint(): boolean {
  return !!process.env.OPENCLI_CDP_TARGET?.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const __test__ = {
  selectCDPTarget,
  selectBrowserAttachTarget,
  selectTargetById,
  isBrowserAttachableTarget,
  scoreCDPTarget,
  parseBrowserWebSocketUrlFromActivePort,
  parseAnyBrowserWebSocketUrlFromActivePort,
  extractBrowserWebSocketUrlFromVersionPayload,
  rewriteBrowserWebSocketUrlForEndpoint,
  isBrowserLevelWebSocket,
  isLoopbackHost,
  shouldPreferNewBrowserTarget,
  hasExplicitTargetHint,
  normalizeWorkspaceKey,
  makePersistentTargetRegistryKey,
  persistentTargetRegistryPath: PERSISTENT_TARGET_REGISTRY_PATH,
};

function fetchJsonDirect(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = (parsed.protocol === 'https:' ? httpsRequest : httpRequest)(parsed, (res) => {
      const statusCode = res.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(normalizeError(error));
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(10_000, () => request.destroy(new Error('Timed out fetching CDP targets')));
    request.end();
  });
}

function logVerbose(message: string, error?: Error): void {
  if (process.env.OPENCLI_VERBOSE !== '1') return;
  console.error(error ? `${message}: ${error.message}` : message);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
