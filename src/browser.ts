/**
 * Browser interaction via Playwright MCP Bridge extension.
 * Connects to an existing Chrome browser through the extension.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { formatSnapshot } from './snapshotFormatter.js';
import { PKG_VERSION } from './version.js';
import { normalizeEvaluateSource } from './pipeline/template.js';
import { generateInterceptorJs, generateReadInterceptedJs } from './interceptor.js';
import { withTimeoutMs, DEFAULT_BROWSER_CONNECT_TIMEOUT } from './runtime.js';
const STDERR_BUFFER_LIMIT = 16 * 1024;
const INITIAL_TABS_TIMEOUT_MS = 1500;
const TAB_CLEANUP_TIMEOUT_MS = 2000;
let _cachedMcpServerPath: string | null | undefined;

type ConnectFailureKind = 'missing-token' | 'extension-timeout' | 'extension-not-installed' | 'mcp-init' | 'process-exit' | 'unknown';
type PlaywrightMCPState = 'idle' | 'connecting' | 'connected' | 'closing' | 'closed';

type ConnectFailureInput = {
  kind: ConnectFailureKind;
  timeout: number;
  hasExtensionToken: boolean;
  tokenFingerprint?: string | null;
  stderr?: string;
  exitCode?: number | null;
  rawMessage?: string;
};

export function getTokenFingerprint(token: string | undefined): string | null {
  if (!token) return null;
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

export function formatBrowserConnectError(input: ConnectFailureInput): Error {
  const stderr = input.stderr?.trim();
  const suffix = stderr ? `\n\nMCP stderr:\n${stderr}` : '';
  const tokenHint = input.tokenFingerprint ? ` Token fingerprint: ${input.tokenFingerprint}.` : '';

  if (input.kind === 'missing-token') {
    return new Error(
      'Failed to connect to Playwright MCP Bridge: PLAYWRIGHT_MCP_EXTENSION_TOKEN is not set.\n\n' +
      'Without this token, Chrome will show a manual approval dialog for every new MCP connection. ' +
      'Copy the token from the Playwright MCP Bridge extension and set it in BOTH your shell environment and MCP client config.' +
      suffix,
    );
  }

  if (input.kind === 'extension-not-installed') {
    return new Error(
      'Failed to connect to Playwright MCP Bridge: the browser extension did not attach.\n\n' +
      'Make sure Chrome is running and the "Playwright MCP Bridge" extension is installed and enabled. ' +
      'If Chrome shows an approval dialog, click Allow.' +
      suffix,
    );
  }

  if (input.kind === 'extension-timeout') {
    const likelyCause = input.hasExtensionToken
      ? `The most likely cause is that PLAYWRIGHT_MCP_EXTENSION_TOKEN does not match the token currently shown by the browser extension.${tokenHint} Re-copy the token from the extension and update BOTH your shell environment and MCP client config.`
      : 'PLAYWRIGHT_MCP_EXTENSION_TOKEN is not configured, so the extension may be waiting for manual approval.';
    return new Error(
      `Timed out connecting to Playwright MCP Bridge (${input.timeout}s).\n\n` +
      `${likelyCause} If a browser prompt is visible, click Allow.` +
      suffix,
    );
  }

  if (input.kind === 'mcp-init') {
    return new Error(`Failed to initialize Playwright MCP: ${input.rawMessage ?? 'unknown error'}${suffix}`);
  }

  if (input.kind === 'process-exit') {
    return new Error(
      `Playwright MCP process exited before the browser connection was established${input.exitCode == null ? '' : ` (code ${input.exitCode})`}.` +
      suffix,
    );
  }

  return new Error(input.rawMessage ?? 'Failed to connect to browser');
}

function inferConnectFailureKind(args: {
  hasExtensionToken: boolean;
  stderr: string;
  rawMessage?: string;
  exited?: boolean;
}): ConnectFailureKind {
  const haystack = `${args.rawMessage ?? ''}\n${args.stderr}`.toLowerCase();

  if (!args.hasExtensionToken)
    return 'missing-token';
  if (haystack.includes('extension connection timeout') || haystack.includes('playwright mcp bridge'))
    return 'extension-not-installed';
  if (args.rawMessage?.startsWith('MCP init failed:'))
    return 'mcp-init';
  if (args.exited)
    return 'process-exit';
  return 'extension-timeout';
}

// JSON-RPC helpers
let _nextId = 1;
function createJsonRpcRequest(method: string, params: Record<string, any> = {}): { id: number; message: string } {
  const id = _nextId++;
  return {
    id,
    message: JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
  };
}

import type { IPage } from './types.js';

/**
 * Page abstraction wrapping JSON-RPC calls to Playwright MCP.
 */
export class Page implements IPage {
  constructor(private _request: (method: string, params?: Record<string, any>) => Promise<any>) {}

  async call(method: string, params: Record<string, any> = {}): Promise<any> {
    const resp = await this._request(method, params);
    if (resp.error) throw new Error(`page.${method}: ${resp.error.message ?? JSON.stringify(resp.error)}`);
    // Extract text content from MCP result
    const result = resp.result;
    if (result?.content) {
      const textParts = result.content.filter((c: any) => c.type === 'text');
      if (textParts.length === 1) {
        let text = textParts[0].text;
        // MCP browser_evaluate returns: "[JSON]\n### Ran Playwright code\n```js\n...\n```"
        // Strip the "### Ran Playwright code" suffix to get clean JSON
        const codeMarker = text.indexOf('### Ran Playwright code');
        if (codeMarker !== -1) {
          text = text.slice(0, codeMarker).trim();
        }
        // Also handle "### Result\n[JSON]" format (some MCP versions)
        const resultMarker = text.indexOf('### Result\n');
        if (resultMarker !== -1) {
          text = text.slice(resultMarker + '### Result\n'.length).trim();
        }
        try { return JSON.parse(text); } catch { return text; }
      }
    }
    return result;
  }

  // --- High-level methods ---

  async goto(url: string): Promise<void> {
    await this.call('tools/call', { name: 'browser_navigate', arguments: { url } });
  }

  async evaluate(js: string): Promise<any> {
    // Normalize IIFE format to function format expected by MCP browser_evaluate
    const normalized = normalizeEvaluateSource(js);
    return this.call('tools/call', { name: 'browser_evaluate', arguments: { function: normalized } });
  }

  async snapshot(opts: { interactive?: boolean; compact?: boolean; maxDepth?: number; raw?: boolean } = {}): Promise<any> {
    const raw = await this.call('tools/call', { name: 'browser_snapshot', arguments: {} });
    if (opts.raw) return raw;
    if (typeof raw === 'string') return formatSnapshot(raw, opts);
    return raw;
  }

  async click(ref: string): Promise<void> {
    await this.call('tools/call', { name: 'browser_click', arguments: { element: 'click target', ref } });
  }

  async typeText(ref: string, text: string): Promise<void> {
    await this.call('tools/call', { name: 'browser_type', arguments: { element: 'type target', ref, text } });
  }

  async pressKey(key: string): Promise<void> {
    await this.call('tools/call', { name: 'browser_press_key', arguments: { key } });
  }

  async wait(options: number | { text?: string; time?: number; timeout?: number }): Promise<void> {
    if (typeof options === 'number') {
      await this.call('tools/call', { name: 'browser_wait_for', arguments: { time: options } });
    } else {
      // Pass directly to native wait_for, which supports natively awaiting text strings without heavy DOM polling
      await this.call('tools/call', { name: 'browser_wait_for', arguments: options });
    }
  }

  async tabs(): Promise<any> {
    return this.call('tools/call', { name: 'browser_tabs', arguments: { action: 'list' } });
  }

  async closeTab(index?: number): Promise<void> {
    await this.call('tools/call', { name: 'browser_tabs', arguments: { action: 'close', ...(index !== undefined ? { index } : {}) } });
  }

  async newTab(): Promise<void> {
    await this.call('tools/call', { name: 'browser_tabs', arguments: { action: 'new' } });
  }

  async selectTab(index: number): Promise<void> {
    await this.call('tools/call', { name: 'browser_tabs', arguments: { action: 'select', index } });
  }

  async networkRequests(includeStatic: boolean = false): Promise<any> {
    return this.call('tools/call', { name: 'browser_network_requests', arguments: { includeStatic } });
  }

  async consoleMessages(level: string = 'info'): Promise<any> {
    return this.call('tools/call', { name: 'browser_console_messages', arguments: { level } });
  }

  async scroll(direction: string = 'down', _amount: number = 500): Promise<void> {
    await this.call('tools/call', { name: 'browser_press_key', arguments: { key: direction === 'down' ? 'PageDown' : 'PageUp' } });
  }

  async autoScroll(options: { times?: number; delayMs?: number } = {}): Promise<void> {
    const times = options.times ?? 3;
    const delayMs = options.delayMs ?? 2000;
    const js = `
      async () => {
        const maxTimes = ${times};
        const maxWaitMs = ${delayMs};
        for (let i = 0; i < maxTimes; i++) {
          const lastHeight = document.body.scrollHeight;
          window.scrollTo(0, lastHeight);
          await new Promise(resolve => {
            let timeoutId;
            const observer = new MutationObserver(() => {
              if (document.body.scrollHeight > lastHeight) {
                clearTimeout(timeoutId);
                observer.disconnect();
                setTimeout(resolve, 100); // Small debounce for rendering
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            timeoutId = setTimeout(() => {
              observer.disconnect();
              resolve(null);
            }, maxWaitMs);
          });
        }
      }
    `;
    await this.evaluate(js);
  }

  async installInterceptor(pattern: string): Promise<void> {
    await this.evaluate(generateInterceptorJs(JSON.stringify(pattern), {
      arrayName: '__opencli_xhr',
      patchGuard: '__opencli_interceptor_patched',
    }));
  }

  async getInterceptedRequests(): Promise<any[]> {
    const result = await this.evaluate(generateReadInterceptedJs('__opencli_xhr'));
    return result || [];
  }
}

/**
 * Playwright MCP process manager.
 */
export class PlaywrightMCP {
  private static _activeInsts: Set<PlaywrightMCP> = new Set();
  private static _cleanupRegistered = false;

  private static _registerGlobalCleanup() {
    if (this._cleanupRegistered) return;
    this._cleanupRegistered = true;
    const cleanup = () => {
      for (const inst of this._activeInsts) {
        if (inst._proc && !inst._proc.killed) {
          try { inst._proc.kill('SIGKILL'); } catch {}
        }
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(130); });
    process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  }

  private _proc: ChildProcess | null = null;
  private _buffer = '';
  private _pending = new Map<number, { resolve: (data: any) => void; reject: (error: Error) => void }>();
  private _initialTabIdentities: string[] = [];
  private _closingPromise: Promise<void> | null = null;
  private _state: PlaywrightMCPState = 'idle';

  private _page: Page | null = null;

  get state(): PlaywrightMCPState {
    return this._state;
  }

  private _sendRequest(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (!this._proc?.stdin?.writable) {
        reject(new Error('Playwright MCP process is not writable'));
        return;
      }
      const { id, message } = createJsonRpcRequest(method, params);
      this._pending.set(id, { resolve, reject });
      this._proc.stdin.write(message, (err) => {
        if (!err) return;
        this._pending.delete(id);
        reject(err);
      });
    });
  }

  private _rejectPendingRequests(error: Error): void {
    const pending = [...this._pending.values()];
    this._pending.clear();
    for (const waiter of pending) waiter.reject(error);
  }

  private _resetAfterFailedConnect(): void {
    const proc = this._proc;
    this._page = null;
    this._proc = null;
    this._buffer = '';
    this._initialTabIdentities = [];
    this._rejectPendingRequests(new Error('Playwright MCP connect failed'));
    PlaywrightMCP._activeInsts.delete(this);
    if (proc && !proc.killed) {
      try { proc.kill('SIGKILL'); } catch {}
    }
  }

  async connect(opts: { timeout?: number } = {}): Promise<Page> {
    if (this._state === 'connected' && this._page) return this._page;
    if (this._state === 'connecting') throw new Error('Playwright MCP is already connecting');
    if (this._state === 'closing') throw new Error('Playwright MCP is closing');
    if (this._state === 'closed') throw new Error('Playwright MCP session is closed');

    const mcpPath = findMcpServerPath();
    if (!mcpPath) throw new Error('Playwright MCP server not found. Install: npm install -D @playwright/mcp');

    PlaywrightMCP._registerGlobalCleanup();
    PlaywrightMCP._activeInsts.add(this);
    this._state = 'connecting';
    const timeout = opts.timeout ?? DEFAULT_BROWSER_CONNECT_TIMEOUT;

    return new Promise<Page>((resolve, reject) => {
      const isDebug = process.env.DEBUG?.includes('opencli:mcp');
      const debugLog = (msg: string) => isDebug && console.error(`[opencli:mcp] ${msg}`);
      const useExtension = !!process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN;
      const extensionToken = process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN;
      const tokenFingerprint = getTokenFingerprint(extensionToken);
      let stderrBuffer = '';
      let settled = false;

      const settleError = (kind: ConnectFailureKind, extra: { rawMessage?: string; exitCode?: number | null } = {}) => {
        if (settled) return;
        settled = true;
        this._state = 'idle';
        clearTimeout(timer);
        this._resetAfterFailedConnect();
        reject(formatBrowserConnectError({
          kind,
          timeout,
          hasExtensionToken: !!extensionToken,
          tokenFingerprint,
          stderr: stderrBuffer,
          exitCode: extra.exitCode,
          rawMessage: extra.rawMessage,
        }));
      };

      const settleSuccess = (pageToResolve: Page) => {
        if (settled) return;
        settled = true;
        this._state = 'connected';
        clearTimeout(timer);
        resolve(pageToResolve);
      };

      const timer = setTimeout(() => {
        debugLog('Connection timed out');
        settleError(inferConnectFailureKind({
          hasExtensionToken: !!extensionToken,
          stderr: stderrBuffer,
        }));
      }, timeout * 1000);

      const mcpArgs = buildMcpArgs({
        mcpPath,
        executablePath: process.env.OPENCLI_BROWSER_EXECUTABLE_PATH,
      });
      if (process.env.OPENCLI_VERBOSE) {
        console.error(`[opencli] Mode: ${useExtension ? 'extension' : 'standalone'}`);
        if (useExtension) console.error(`[opencli] Extension token: fingerprint ${tokenFingerprint}`);
      }
      debugLog(`Spawning node ${mcpArgs.join(' ')}`);

      this._proc = spawn('node', mcpArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      // Increase max listeners to avoid warnings
      this._proc.setMaxListeners(20);
      if (this._proc.stdout) this._proc.stdout.setMaxListeners(20);

      const page = new Page((method, params = {}) => this._sendRequest(method, params));
      this._page = page;

      this._proc.stdout?.on('data', (chunk: Buffer) => {
        this._buffer += chunk.toString();
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          debugLog(`RECV: ${line}`);
          try {
            const parsed = JSON.parse(line);
            if (typeof parsed?.id === 'number') {
              const waiter = this._pending.get(parsed.id);
              if (waiter) {
                this._pending.delete(parsed.id);
                waiter.resolve(parsed);
              }
            }
          } catch (e) {
            debugLog(`Parse error: ${e}`);
          }
        }
      });

      this._proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer = appendLimited(stderrBuffer, text, STDERR_BUFFER_LIMIT);
        debugLog(`STDERR: ${text}`);
      });
      this._proc.on('error', (err) => {
        debugLog(`Subprocess error: ${err.message}`);
        this._rejectPendingRequests(new Error(`Playwright MCP process error: ${err.message}`));
        settleError('process-exit', { rawMessage: err.message });
      });
      this._proc.on('close', (code) => {
        debugLog(`Subprocess closed with code ${code}`);
        this._rejectPendingRequests(new Error(`Playwright MCP process exited before response${code == null ? '' : ` (code ${code})`}`));
        if (!settled) {
          settleError(inferConnectFailureKind({
            hasExtensionToken: !!extensionToken,
            stderr: stderrBuffer,
            exited: true,
          }), { exitCode: code });
        }
      });

      // Initialize: send initialize request
      debugLog('Waiting for initialize response...');
      this._sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'opencli', version: PKG_VERSION },
      }).then((resp) => {
        debugLog('Got initialize response');
        if (resp.error) {
          settleError(inferConnectFailureKind({
            hasExtensionToken: !!extensionToken,
            stderr: stderrBuffer,
            rawMessage: `MCP init failed: ${resp.error.message}`,
          }), { rawMessage: resp.error.message });
          return;
        }
        
        const initializedMsg = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n';
        debugLog(`SEND: ${initializedMsg.trim()}`);
        this._proc?.stdin?.write(initializedMsg);

        // Use tabs as a readiness probe and for tab cleanup bookkeeping.
        debugLog('Fetching initial tabs count...');
        withTimeoutMs(page.tabs(), INITIAL_TABS_TIMEOUT_MS, 'Timed out fetching initial tabs').then((tabs: any) => {
          debugLog(`Tabs response: ${typeof tabs === 'string' ? tabs : JSON.stringify(tabs)}`);
          this._initialTabIdentities = extractTabIdentities(tabs);
          settleSuccess(page);
        }).catch((err) => {
          debugLog(`Tabs fetch error: ${err.message}`);
          settleSuccess(page);
        });
      }).catch((err) => {
        debugLog(`Init promise rejected: ${err.message}`);
        settleError('mcp-init', { rawMessage: err.message });
      });
    });
  }


  async close(): Promise<void> {
    if (this._closingPromise) return this._closingPromise;
    if (this._state === 'closed') return;
    this._state = 'closing';
    this._closingPromise = (async () => {
      try {
        // Extension mode opens bridge/session tabs that we can clean up best-effort.
        if (this._page && this._proc && !this._proc.killed) {
          try {
            const tabs = await withTimeoutMs(this._page.tabs(), TAB_CLEANUP_TIMEOUT_MS, 'Timed out fetching tabs during cleanup');
            const tabEntries = extractTabEntries(tabs);
            const tabsToClose = diffTabIndexes(this._initialTabIdentities, tabEntries);
            for (const index of tabsToClose) {
              try { await this._page.closeTab(index); } catch {}
            }
          } catch {}
        }
        if (this._proc && !this._proc.killed) {
          this._proc.kill('SIGTERM');
          const exited = await new Promise<boolean>((res) => {
            let done = false;
            const finish = (value: boolean) => {
              if (done) return;
              done = true;
              res(value);
            };
            this._proc?.once('exit', () => finish(true));
            setTimeout(() => finish(false), 3000);
          });
          if (!exited && this._proc && !this._proc.killed) {
            try { this._proc.kill('SIGKILL'); } catch {}
          }
        }
      } finally {
        this._rejectPendingRequests(new Error('Playwright MCP session closed'));
        this._page = null;
        this._proc = null;
        this._state = 'closed';
        PlaywrightMCP._activeInsts.delete(this);
      }
    })();
    return this._closingPromise;
  }
}

function extractTabEntries(raw: any): Array<{ index: number; identity: string }> {
  if (Array.isArray(raw)) {
    return raw.map((tab: any, index: number) => ({
      index,
      identity: [
        tab?.id ?? '',
        tab?.url ?? '',
        tab?.title ?? '',
        tab?.name ?? '',
      ].join('|'),
    }));
  }

  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        // Match actual Playwright MCP format: "- 0: (current) [title](url)"  or  "- 1: [title](url)"
        const mcpMatch = line.match(/^-\s+(\d+):\s*(.*)$/);
        if (mcpMatch) {
          return {
            index: parseInt(mcpMatch[1], 10),
            identity: mcpMatch[2].trim() || `tab-${mcpMatch[1]}`,
          };
        }
        // Legacy format: "Tab 0 ..."
        const legacyMatch = line.match(/Tab\s+(\d+)\s*(.*)$/);
        if (legacyMatch) {
          return {
            index: parseInt(legacyMatch[1], 10),
            identity: legacyMatch[2].trim() || `tab-${legacyMatch[1]}`,
          };
        }
        return null;
      })
      .filter((entry): entry is { index: number; identity: string } => entry !== null);
  }

  return [];
}

function extractTabIdentities(raw: any): string[] {
  return extractTabEntries(raw).map(tab => tab.identity);
}

function diffTabIndexes(initialIdentities: string[], currentTabs: Array<{ index: number; identity: string }>): number[] {
  if (initialIdentities.length === 0 || currentTabs.length === 0) return [];
  const remaining = new Map<string, number>();
  for (const identity of initialIdentities) {
    remaining.set(identity, (remaining.get(identity) ?? 0) + 1);
  }

  const tabsToClose: number[] = [];
  for (const tab of currentTabs) {
    const count = remaining.get(tab.identity) ?? 0;
    if (count > 0) {
      remaining.set(tab.identity, count - 1);
      continue;
    }
    tabsToClose.push(tab.index);
  }

  return tabsToClose.sort((a, b) => b - a);
}

function appendLimited(current: string, chunk: string, limit: number): string {
  const next = current + chunk;
  if (next.length <= limit) return next;
  return next.slice(-limit);
}

function buildMcpArgs(input: { mcpPath: string; executablePath?: string | null }): string[] {
  const args = [input.mcpPath];
  if (!process.env.CI) {
    // Local: always connect to user's running Chrome via MCP Bridge extension
    args.push('--extension');
  }
  // CI: standalone mode — @playwright/mcp launches its own browser (headed by default).
  // xvfb provides a virtual display for headed mode in GitHub Actions.
  if (input.executablePath) {
    args.push('--executable-path', input.executablePath);
  }
  return args;
}

export const __test__ = {
  createJsonRpcRequest,
  extractTabEntries,
  diffTabIndexes,
  appendLimited,
  buildMcpArgs,
  withTimeoutMs,
};

function findMcpServerPath(): string | null {
  if (_cachedMcpServerPath !== undefined) return _cachedMcpServerPath;

  const envMcp = process.env.OPENCLI_MCP_SERVER_PATH;
  if (envMcp && fs.existsSync(envMcp)) {
    _cachedMcpServerPath = envMcp;
    return _cachedMcpServerPath;
  }

  // Check local node_modules first (@playwright/mcp is the modern package)
  const localMcp = path.resolve('node_modules', '@playwright', 'mcp', 'cli.js');
  if (fs.existsSync(localMcp)) {
    _cachedMcpServerPath = localMcp;
    return _cachedMcpServerPath;
  }

  // Check project-relative path
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const projectMcp = path.resolve(__dirname2, '..', 'node_modules', '@playwright', 'mcp', 'cli.js');
  if (fs.existsSync(projectMcp)) {
    _cachedMcpServerPath = projectMcp;
    return _cachedMcpServerPath;
  }

  // Check global npm/yarn locations derived from current Node runtime.
  const nodePrefix = path.resolve(path.dirname(process.execPath), '..');
  const globalNodeModules = path.join(nodePrefix, 'lib', 'node_modules');
  const globalMcp = path.join(globalNodeModules, '@playwright', 'mcp', 'cli.js');
  if (fs.existsSync(globalMcp)) {
    _cachedMcpServerPath = globalMcp;
    return _cachedMcpServerPath;
  }

  // Check npm global root directly.
  try {
    const npmRootGlobal = execSync('npm root -g 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
    const npmGlobalMcp = path.join(npmRootGlobal, '@playwright', 'mcp', 'cli.js');
    if (npmRootGlobal && fs.existsSync(npmGlobalMcp)) {
      _cachedMcpServerPath = npmGlobalMcp;
      return _cachedMcpServerPath;
    }
  } catch {}

  // Check common locations
  const candidates = [
    path.join(os.homedir(), '.npm', '_npx'),
    path.join(os.homedir(), 'node_modules', '.bin'),
    '/usr/local/lib/node_modules',
  ];

  // Try npx resolution (legacy package name)
  try {
    const result = execSync('npx -y --package=@playwright/mcp which mcp-server-playwright 2>/dev/null', { encoding: 'utf-8', timeout: 10000 }).trim();
    if (result && fs.existsSync(result)) {
      _cachedMcpServerPath = result;
      return _cachedMcpServerPath;
    }
  } catch {}

  // Try which
  try {
    const result = execSync('which mcp-server-playwright 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && fs.existsSync(result)) {
      _cachedMcpServerPath = result;
      return _cachedMcpServerPath;
    }
  } catch {}

  // Search in common npx cache
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    try {
      const found = execSync(`find "${base}" -name "cli.js" -path "*playwright*mcp*" 2>/dev/null | head -1`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (found) {
        _cachedMcpServerPath = found;
        return _cachedMcpServerPath;
      }
    } catch {}
  }

  _cachedMcpServerPath = null;
  return _cachedMcpServerPath;
}
