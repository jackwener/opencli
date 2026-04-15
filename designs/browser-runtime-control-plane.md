# Browser Runtime Control Plane — Design Document

**Authors**: @coding-claude-opus, @codex-coder, @First-principles-0
**Date**: 2026-04-15
**Status**: Draft
**Related**: #1028 (stale daemon fix), #1030 (old extension compat)

---

## Problem Statement

The daemon/extension layer currently works as a "background process on a fixed port that waits for an extension to connect." This leads to a class of problems that keep recurring as patches:

1. **Stale daemon** — old daemon occupies the port, extension registration window missed (#1028)
2. **Old extension** — extension connects but lacks capabilities, crashes on unknown actions (#1030)
3. **Implicit state** — `doctor` and CLI infer health from sparse fields + error strings instead of structured state
4. **Non-transactional lifecycle** — `daemon stop` reports success before the process exits; auto-replace is more rigorous than manual repair
5. **Correctness bugs** — command ID collisions across CLI processes, timeout mismatch causing duplicate commands, race conditions in stale replacement

### Design Goal

Redesign this layer as a **Browser Runtime Control Plane**: a system with explicit identity, capability handshake, structured health, transactional lifecycle, and clear ownership semantics.

**Principles:**
- Doctor is a renderer, not a reasoning engine
- Capability is declared up front, not inferred from errors
- All lifecycle operations (start/stop/replace) use the same transactional semantics
- Every state is structurally representable and diagnosable

---

## 1. Runtime Identity

### 1.1 Daemon Identity

Every daemon instance is a **generation**. On startup, the daemon generates a `generationId` and records its birth context.

```typescript
// daemon.ts — new state
const generationId = crypto.randomUUID();
const startedAt = Date.now();
```

`/status` returns:

```json
{
  "generationId": "550e8400-e29b-41d4-a716-446655440000",
  "daemonVersion": "1.7.4",
  "startedAt": 1713200000000,
  "port": 19825
}
```

### 1.2 Extension Session Identity

The extension sends identity in `hello`. The daemon stores it as the **active extension session**.

### 1.3 Ownership Check

CLI determines trust by comparing `daemonVersion` against its own `PKG_VERSION`. This is already implemented in #1028. The `generationId` provides a unique handle for replace operations (see §4).

---

## 2. Protocol: Hello v2

### 2.1 Schema

```typescript
interface HelloV1 {
  type: 'hello';
  version?: string;       // extension version
  compatRange?: string;   // CLI version range
}

interface HelloV2 {
  type: 'hello';
  protocolVersion: 2;
  version: string;                // extension version (required)
  compatRange: string;            // CLI compatibility range (required)
  capabilities: string[];         // declared capability set
  instanceId: string;             // unique per service worker lifecycle
  browserType: 'chrome' | 'chromium' | 'edge' | 'brave' | 'arc';
}
```

### 2.2 Compatibility Rules

| Extension sends | Daemon interprets |
|---|---|
| No `protocolVersion` field | Hello v1 — capabilities = `[]`, version may be null |
| `protocolVersion: 2` | Hello v2 — full capability set declared |
| Unknown capability strings | Ignored (forward-compatible) |
| Missing expected capabilities | Daemon marks `capabilityState: "degraded"` |

### 2.3 Backward Compatibility

- Old extension (v1 hello) + new daemon: works. Capabilities empty → all capability-gated features use fallback paths. Doctor warns "version unknown" or "capabilities not declared."
- New extension (v2 hello) + old daemon: works. Old daemon ignores unknown fields in hello, stores `version` and `compatRange` as before.

### 2.4 Daemon Storage

```typescript
// daemon.ts — extended state
let extensionProtocolVersion: number | null = null;
let extensionCapabilities: string[] = [];
let extensionInstanceId: string | null = null;
let extensionBrowserType: string | null = null;
let lastHelloAt: number | null = null;
```

On `hello` message:
```typescript
if (msg.protocolVersion === 2) {
  extensionProtocolVersion = 2;
  extensionCapabilities = Array.isArray(msg.capabilities) ? msg.capabilities : [];
  extensionInstanceId = msg.instanceId ?? null;
  extensionBrowserType = msg.browserType ?? null;
} else {
  extensionProtocolVersion = 1;
  extensionCapabilities = [];
}
lastHelloAt = Date.now();
```

---

## 3. Capability Routing Table

Every browser capability has three paths: native, fallback, and unavailable.

| Capability | Native Path | Fallback Path | Unavailable Behavior |
|---|---|---|---|
| `networkCapture` | extension `network-capture-start/read` | JS interceptor (`NETWORK_INTERCEPTOR_JS`) | `browser network` returns limited results; `explore` warns "API endpoint detection limited" |
| `insertText` | extension `insert-text` action | `page.evaluate()` with `document.execCommand('insertText')` | Error: "insert-text not supported by current extension" |
| `fileInput` | extension `set-file-input` via CDP `DOM.setFileInputFiles` | Not possible without CDP | Error: "file input requires extension v1.6.0+" |
| `cdpDirect` | extension `cdp` action (passthrough) | Not possible | Error: "CDP passthrough requires extension v1.5.0+" |
| `tabManagement` | extension `tabs` action (list/new/close/select) | Not possible | Error: "tab management requires the Browser Bridge extension" |
| `screenshot` | extension `screenshot` action | Not possible | Error: "screenshot requires the Browser Bridge extension" |
| `cookies` | extension `cookies` action | Not possible | Error: "cookie access requires the Browser Bridge extension" |
| `navigatePreserveCapture` | Extension preserves debugger during navigation when capture is active | Detach + re-attach (may lose initial requests) | N/A — transparent to caller |

### 3.1 Capability-Aware Page

`Page` queries `/status` once during construction to get the capability set. Actions check capability before dispatch:

```typescript
// page.ts
class Page extends BasePage {
  private _capabilities: Set<string>;

  constructor(workspace: string, capabilities: string[] = []) {
    super();
    this._capabilities = new Set(capabilities);
  }

  hasCapability(cap: string): boolean {
    return this._capabilities.has(cap);
  }

  async startNetworkCapture(pattern: string = ''): Promise<boolean> {
    if (!this.hasCapability('networkCapture')) return false;
    // ... send command
    return true;
  }
}
```

`BrowserBridge.connect()` passes capabilities from `/status` to `Page`:

```typescript
// bridge.ts
async connect(opts = {}): Promise<IPage> {
  await this._ensureDaemon(opts.timeout);
  const status = await fetchDaemonStatus();
  const capabilities = status?.capabilities ?? [];
  this._page = new Page(opts.workspace, capabilities);
  return this._page;
}
```

### 3.2 Eliminating Error-Driven Fallback

With capabilities declared up front:
- `browser open` checks `hasCapability('networkCapture')` → decides JS interceptor vs native before any command is sent
- `explore` checks capabilities → adjusts strategy before navigation
- No more "send command → catch Unknown action → mark unsupported" pattern on the main path

The existing error-driven fallback in `Page` (from #1030) is retained as a **safety net** for edge cases (extension declares capability but command fails), not as the primary routing mechanism.

---

## 4. Structured Health Model

### 4.1 Four-Dimensional Health

Replace the current `stopped | no-extension | ready` with four orthogonal dimensions:

```typescript
interface RuntimeHealth {
  transport: 'stopped' | 'starting' | 'connected' | 'disconnected';
  compatibility: 'compatible' | 'stale_daemon' | 'stale_extension' | 'version_unknown' | 'incompatible';
  capability: 'full' | 'degraded' | 'none';
  commandLane: 'idle' | 'busy' | 'stuck';
}
```

### 4.2 Derivation Rules

The daemon computes health on each `/status` request:

```typescript
function deriveHealth(): RuntimeHealth {
  const transport = !extensionWs ? 'disconnected'
    : extensionWs.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';

  const compatibility = !extensionVersion ? 'version_unknown'
    : extensionCompatRange && !satisfiesRange(PKG_VERSION, extensionCompatRange) ? 'incompatible'
    : 'compatible';

  const capability = extensionCapabilities.length === 0 ? 'none'
    : REQUIRED_CAPABILITIES.every(c => extensionCapabilities.includes(c)) ? 'full'
    : 'degraded';

  const oldestPendingAge = getOldestPendingAge();
  const commandLane = pending.size === 0 ? 'idle'
    : oldestPendingAge > 30000 ? 'stuck'
    : 'busy';

  return { transport, compatibility, capability, commandLane };
}
```

### 4.3 Extended `/status` Response

```json
{
  "generationId": "550e8400-...",
  "daemonVersion": "1.7.4",
  "startedAt": 1713200000000,
  "port": 19825,
  "pid": 12345,
  "uptime": 3661,
  "memoryMB": 64,

  "health": {
    "transport": "connected",
    "compatibility": "compatible",
    "capability": "full",
    "commandLane": "idle"
  },

  "extension": {
    "connected": true,
    "version": "1.6.8",
    "protocolVersion": 2,
    "compatRange": ">=1.5.0",
    "capabilities": ["networkCapture", "insertText", "fileInput", "cdpDirect", "tabManagement", "screenshot", "cookies", "navigatePreserveCapture"],
    "instanceId": "ext_abc123",
    "browserType": "chrome"
  },

  "timestamps": {
    "lastHelloAt": 1713200001000,
    "lastHeartbeatAt": 1713200015000,
    "lastCommandAt": 1713199990000,
    "lastSuccessfulCommandAt": 1713199990000
  },

  "commandLane": {
    "pendingCount": 0,
    "oldestPendingAgeMs": 0
  },

  "missingCapabilities": [],
  "degradedCapabilities": []
}
```

### 4.4 `getDaemonHealth()` Client-Side Mapping

```typescript
// daemon-client.ts
export type DaemonHealth =
  | { state: 'stopped'; status: null }
  | { state: 'no-extension'; status: DaemonStatus }
  | { state: 'ready'; status: DaemonStatus }
  | { state: 'degraded'; status: DaemonStatus }     // NEW
  | { state: 'incompatible'; status: DaemonStatus }; // NEW

export async function getDaemonHealth(): Promise<DaemonHealth> {
  const status = await fetchDaemonStatus();
  if (!status) return { state: 'stopped', status: null };
  if (!status.extension?.connected) return { state: 'no-extension', status };
  if (status.health?.compatibility === 'incompatible') return { state: 'incompatible', status };
  if (status.health?.capability === 'degraded' || status.health?.capability === 'none')
    return { state: 'degraded', status };
  return { state: 'ready', status };
}
```

### 4.5 Doctor as Renderer

`doctor` maps structured health to human-readable output. No inference logic — just translation:

```typescript
function renderHealthLine(health: RuntimeHealth): string {
  const lines: string[] = [];

  // Transport
  const transportIcon = health.transport === 'connected' ? '[OK]' : '[MISSING]';
  lines.push(`${transportIcon} Transport: ${health.transport}`);

  // Compatibility
  const compatIcon = health.compatibility === 'compatible' ? '[OK]'
    : health.compatibility === 'version_unknown' ? '[WARN]' : '[FAIL]';
  lines.push(`${compatIcon} Compatibility: ${health.compatibility}`);

  // Capability
  const capIcon = health.capability === 'full' ? '[OK]'
    : health.capability === 'degraded' ? '[WARN]' : '[FAIL]';
  lines.push(`${capIcon} Capability: ${health.capability}`);

  // Command lane
  const laneIcon = health.commandLane === 'idle' ? '[OK]'
    : health.commandLane === 'busy' ? '[OK]' : '[FAIL]';
  lines.push(`${laneIcon} Command Lane: ${health.commandLane}`);

  return lines.join('\n');
}
```

---

## 5. Transactional Lifecycle

### 5.1 State Machine

```
                    ┌──────────┐
         spawn      │ starting │
        ┌──────────►│          │
        │           └────┬─────┘
        │                │ HTTP ready
        │                ▼
  ┌─────┴──┐      ┌──────────┐       hello        ┌──────────┐
  │ stopped │      │ awaiting │──────────────────►  │  ready   │
  │         │      │extension │                     │          │
  └─────▲──┘      └──────────┘                     └────┬─────┘
        │                                               │
        │           ┌──────────┐                        │ detect stale/
        │  drained  │ draining │◄───────────────────────┘ incompatible
        ├───────────│          │
        │           └──────────┘         replace request
        │
        │           ┌──────────┐
        └───────────│ stopping │◄─── stop request
                    │          │
                    └──────────┘
```

### 5.2 Confirmed Stop

Both manual `daemon stop` and auto-replace use the same confirmed-stop protocol:

```typescript
// daemon-client.ts
export async function requestConfirmedStop(opts?: { timeout?: number }): Promise<boolean> {
  const timeout = opts?.timeout ?? 5000;
  const accepted = await requestDaemonShutdown();
  if (!accepted) return false;
  // Poll until port is released
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await sleep(200);
    const status = await fetchDaemonStatus({ timeout: 500 });
    if (!status) return true; // Port released
  }
  return false; // Timeout — daemon still alive
}
```

```typescript
// commands/daemon.ts
export async function daemonStop(): Promise<void> {
  const status = await fetchDaemonStatus();
  if (!status) {
    log.info('Daemon is not running.');
    return;
  }
  log.info('Stopping daemon...');
  const stopped = await requestConfirmedStop({ timeout: 5000 });
  if (stopped) {
    log.success('Daemon stopped.');
  } else {
    log.error('Daemon did not stop within 5s. Try: kill ' + status.pid);
  }
}
```

### 5.3 Transactional Replace

```typescript
// bridge.ts — _ensureDaemon replace path
if (isStale) {
  log.info(`Stale daemon detected (${reason}). Replacing...`);

  // 1. Request confirmed stop
  const stopped = await requestConfirmedStop({ timeout: 3000 });
  if (!stopped) {
    throw new BrowserConnectError(
      'Stale daemon could not be replaced',
      `Run manually: opencli daemon stop && opencli doctor`,
      'daemon-not-running',
    );
  }

  // 2. Spawn new generation
  this._spawnDaemon();

  // 3. Wait for ready (HTTP + extension hello)
  if (await this._pollUntilReady(timeoutMs)) return;

  // 4. If no extension after timeout, report clearly
  throw new BrowserConnectError(
    'New daemon started but extension did not connect',
    'Make sure Chrome is open with the Browser Bridge extension enabled.',
    'extension-not-connected',
  );
}
```

### 5.4 Draining

When the daemon receives `/shutdown`, it transitions to `draining`:

```typescript
// daemon.ts
let lifecycleState: 'running' | 'draining' | 'stopping' = 'running';

// In /shutdown handler:
if (lifecycleState !== 'running') {
  jsonResponse(res, 409, { ok: false, error: 'Already shutting down' });
  return;
}
lifecycleState = 'draining';
jsonResponse(res, 200, { ok: true, message: 'Shutting down', generationId });

// Reject new commands during drain:
// In /command handler:
if (lifecycleState !== 'running') {
  jsonResponse(res, 503, { ok: false, error: 'Daemon is shutting down' });
  return;
}

// After short drain window, force shutdown:
setTimeout(() => {
  shutdown();
}, 2000); // 2s drain window
```

---

## 6. Correctness Fixes

These are bugs in the current implementation that must be fixed as part of this work.

### 6.1 Command ID Collision

**Problem**: `cmd_${Date.now()}_${++_idCounter}` can collide across CLI processes.

**Fix**:
```typescript
// daemon-client.ts
import { randomUUID } from 'node:crypto';

function generateId(): string {
  return `cmd_${randomUUID()}`;
}
```

### 6.2 Timeout Contract Mismatch

**Problem**: CLI HTTP fetch times out at 30s, daemon command timeout is 120s. Long commands get aborted and retried while daemon still processes the original.

**Fix**: CLI-side timeout should match the command's daemon-side timeout. Pass timeout in the command payload; CLI waits accordingly:

```typescript
// daemon-client.ts — sendCommandRaw
const timeoutMs = typeof params.timeout === 'number' && params.timeout > 0
  ? params.timeout * 1000 + 5000  // command timeout + 5s buffer
  : 125000; // default 120s + 5s buffer

const res = await requestDaemon('/command', {
  method: 'POST',
  body: JSON.stringify(command),
  timeout: timeoutMs,
});
```

### 6.3 `/command` Route Uses `url` Instead of `pathname`

**Problem**: `daemon.ts:160` — `url === '/command'` fails if query string is present.

**Fix**:
```typescript
// Before:
if (req.method === 'POST' && url === '/command') {
// After:
if (req.method === 'POST' && pathname === '/command') {
```

### 6.4 WebSocket Error Path Cleanup Inconsistency

**Problem**: `ws.on('error')` clears `extensionVersion` but not `extensionCompatRange`.

**Fix**: Clear all extension state in both `error` and `close` handlers. Extract into a helper:

```typescript
function clearExtensionState(ws: WebSocket): void {
  if (extensionWs !== ws) return;
  extensionWs = null;
  extensionVersion = null;
  extensionCompatRange = null;
  extensionProtocolVersion = null;
  extensionCapabilities = [];
  extensionInstanceId = null;
  extensionBrowserType = null;
  lastHelloAt = null;
  // Reject pending
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error('Extension disconnected'));
  }
  pending.clear();
}
```

### 6.5 New Extension Connection Replaces Old Without Cleaning Pending

**Problem**: When a new extension connects, `extensionWs` is replaced but pending requests for the old connection are not rejected.

**Fix**: On new connection, close old ws and reject its pending requests:

```typescript
wss.on('connection', (ws: WebSocket) => {
  if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
    log.info('[daemon] New extension connected, closing previous connection');
    const oldWs = extensionWs;
    clearExtensionState(oldWs);
    oldWs.close();
  }
  extensionWs = ws;
  // ... rest of handler
});
```

### 6.6 `daemon status` Missing Pending Count

**Fix**: Add pending count and oldest age to `daemonStatus()` output:

```typescript
console.log(`Pending: ${status.commandLane?.pendingCount ?? status.pending ?? 0} commands`);
```

---

## 7. Scenario Matrix

Every scenario must have defined behavior across all layers.

| # | Scenario | `/status` health | `doctor` output | CLI behavior | Automated test |
|---|---|---|---|---|---|
| S1 | Same-version daemon, extension connected, full capability | `transport=connected, compat=compatible, cap=full, lane=idle` | `[OK] Everything looks good!` | Commands execute normally | `browser.test.ts: connected state` |
| S2 | Same-version daemon, no extension | `transport=disconnected, compat=N/A, cap=none` | `[MISSING] Extension: not connected` | Wait for extension, timeout with actionable hint | `browser.test.ts: fails fast no extension` |
| S3 | Stale daemon (version mismatch), no extension | N/A — auto-replace triggered | `[WARN] Stale daemon detected` (if replace fails) | Auto-replace: stop old → spawn new → wait ready | `browser.test.ts: stale daemon replacement` |
| S4 | Stale daemon (missing daemonVersion) | N/A — auto-replace triggered | `[WARN] Stale daemon detected` | Same as S3 | `browser.test.ts: stale daemon missing version` |
| S5 | Stale daemon, shutdown fails | N/A | Error with manual recovery hint | Throw `BrowserConnectError` with `opencli daemon stop && opencli doctor` | `browser.test.ts: stale shutdown fail` |
| S6 | v1 extension (no protocolVersion), connected | `transport=connected, compat=version_unknown, cap=none` | `[WARN] Extension: connected (version unknown, capabilities not declared)` | Capability-gated features use fallback; error-driven fallback as safety net | `page.test.ts: v1 extension fallback` |
| S7 | v2 extension, missing `networkCapture` | `transport=connected, compat=compatible, cap=degraded` | `[WARN] Capability: degraded (missing: networkCapture)` | `browser open` uses JS interceptor; `explore` warns limited endpoint detection | `page.test.ts: degraded capability` |
| S8 | v2 extension, full capability | Same as S1 | Same as S1 | All native paths | Same as S1 |
| S9 | Extension connected, heartbeat stale (>30s) | `transport=connected` but `lastHeartbeatAt` old | `[WARN] Extension heartbeat stale` | Commands may timeout; doctor suggests reload extension | `doctor.test.ts: heartbeat stale` |
| S10 | Daemon alive, command lane stuck (oldest pending >30s) | `lane=stuck` | `[FAIL] Command Lane: stuck (N pending, oldest Xs)` | New commands may queue; doctor suggests restart | `doctor.test.ts: command lane stuck` |
| S11 | Manual `daemon stop` | N/A | N/A | Confirmed stop: wait for port release, report success/failure | `daemon.test.ts: confirmed stop` |
| S12 | Extension version incompatible with CLI | `compat=incompatible` | `[FAIL] Incompatible: extension vX requires CLI Y` | Refuse to execute, show upgrade instructions | `doctor.test.ts: incompatible version` |
| S13 | Multiple CLI processes, concurrent commands | Normal — unique command IDs | N/A | Commands execute independently, no ID collision | `daemon-client.test.ts: UUID uniqueness` |
| S14 | Multiple CLI processes detect stale simultaneously | First to request replace wins; second sees new generation | N/A | `requestConfirmedStop` is idempotent; second caller may spawn redundant daemon (EADDRINUSE exits silently) | `bridge.test.ts: concurrent replace` |
| S15 | Extension reconnects mid-command | Old pending rejected with "Extension disconnected"; new connection starts fresh | N/A | CLI retries via `sendCommandRaw` retry loop (classified as `extension-transient`, 1500ms delay) | `page.test.ts: reconnect retry` |

---

## 8. Extension Changes

### 8.1 Hello v2

```typescript
// extension/src/background.ts — onopen
ws.onopen = () => {
  reconnectAttempts = 0;
  ws?.send(JSON.stringify({
    type: 'hello',
    protocolVersion: 2,
    version: chrome.runtime.getManifest().version,
    compatRange: __OPENCLI_COMPAT_RANGE__,
    capabilities: [
      'networkCapture',
      'insertText',
      'fileInput',
      'cdpDirect',
      'tabManagement',
      'screenshot',
      'cookies',
      'navigatePreserveCapture',
    ],
    instanceId: crypto.randomUUID(),
    browserType: detectBrowserType(),
  }));
};
```

### 8.2 Browser Type Detection

```typescript
function detectBrowserType(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Brave')) return 'brave';
  if (ua.includes('Arc')) return 'arc';
  if (ua.includes('Chromium')) return 'chromium';
  return 'chrome';
}
```

---

## 9. Migration Path

This design is fully backward compatible:

1. **New daemon + old extension**: Old extension sends hello v1. Daemon treats capabilities as empty. All capability-gated features use fallback paths. Doctor shows `[WARN]`. Everything works, just degraded.

2. **Old daemon + new extension**: New extension sends hello v2. Old daemon ignores unknown fields, stores `version` and `compatRange` as before. Extension works normally.

3. **New CLI + old daemon**: CLI detects version mismatch via `daemonVersion`, triggers stale replacement (already implemented in #1028).

4. **Rollback**: If new daemon is rolled back to old version, stale detection triggers auto-replace back to old version. No manual intervention needed.

---

## 10. Review & Merge Gate

### 10.1 Daemon Change Scope Trigger

Any PR touching these files triggers full-chain review:
- `src/daemon.ts`
- `src/browser/bridge.ts`
- `src/browser/daemon-client.ts`
- `src/browser/page.ts`
- `src/doctor.ts`
- `src/cli.ts` (browserAction / browser command path)
- `extension/src/background.ts`
- `extension/src/protocol.ts`

### 10.2 Three-Layer Review

1. **Implementation review**: State machine closure, no regressions, failure branches covered
2. **First-principles review**: System model correctness, no symptom patching
3. **Compatibility review**: Cross-version behavior verified against scenario matrix

### 10.3 Release Checklist

Every daemon PR must answer:
1. How does this behave with an old daemon?
2. How does this behave with an old extension?
3. How does this behave with mixed versions?
4. What does the user see on failure (message + hint)?
5. How does `doctor` diagnose this state?
6. Is manual recovery consistent with auto-recovery?

### 10.4 Daemon Regression Suite

A dedicated test suite that must pass before merge:

```
tests/daemon-regression/
├── stale-daemon-replace.test.ts
├── stale-daemon-shutdown-fail.test.ts
├── old-extension-fallback.test.ts
├── capability-routing.test.ts
├── doctor-diagnosis.test.ts
├── confirmed-stop.test.ts
├── command-id-uniqueness.test.ts
├── timeout-contract.test.ts
├── concurrent-replace.test.ts
└── hint-surfacing.test.ts
```

---

## 11. File Change Summary

| File | Changes |
|---|---|
| `extension/src/background.ts` | Hello v2, `detectBrowserType()`, capability list |
| `src/daemon.ts` | `generationId`, extended hello handling, `clearExtensionState()`, draining lifecycle, `/command` pathname fix, extended `/status` |
| `src/browser/daemon-client.ts` | UUID command ID, `requestConfirmedStop()`, extended `DaemonStatus` type, timeout alignment, `DaemonHealth` new states |
| `src/browser/bridge.ts` | Pass capabilities to `Page`, use `requestConfirmedStop()` |
| `src/browser/page.ts` | Capability-aware constructor, `hasCapability()` check before dispatch |
| `src/doctor.ts` | Render from structured health, no inference logic |
| `src/commands/daemon.ts` | Confirmed stop, pending count display |
| `src/cli.ts` | `daemon status` subcommand (already from #1030) |
| `src/types.ts` | `IPage.startNetworkCapture` return type (already done) |
| `tests/daemon-regression/*.test.ts` | New regression suite |
