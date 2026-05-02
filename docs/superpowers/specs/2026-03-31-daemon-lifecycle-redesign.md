# Daemon Lifecycle Redesign

## Problem

OpenCLI's daemon auto-exits after 5 minutes of idle time. During typical development
cycles (write code → test → modify → test again), coding intervals frequently exceed
5 minutes. Each restart incurs 2-4 seconds of overhead (process spawn + Extension
WebSocket reconnection), creating a noticeable and frustrating delay.

The current design treats the daemon as a disposable process, but the actual cost
profile doesn't justify this:

| Cost of staying alive | Cost of restarting |
|-----------------------|--------------------|
| ~12 MB memory, 0% CPU | 2-4 seconds delay per restart |

The restart cost far outweighs the idle cost.

## Solution

Replace the aggressive 5-minute fixed timeout with a long-lived daemon model. The
daemon stays running for hours, exits only when truly abandoned, and reconnects to
the Chrome Extension faster when needed.

Four changes:

1. Extend idle timeout from 5 minutes to 4 hours (configurable)
2. Require dual idle condition: both no CLI requests AND no Extension connection
3. Reduce Extension WebSocket reconnect backoff cap from 60s to 5s
4. Add `opencli daemon status/stop/restart` commands

## Design

### Timeout Strategy

**Current behavior:** A single idle timer resets on each HTTP request. After 5
minutes without a request, the daemon calls `process.exit(0)`.

**New behavior:** The daemon tracks two activity signals independently:

- **CLI activity:** timestamp of the last HTTP request from any CLI invocation
- **Extension activity:** whether a WebSocket connection from the Chrome Extension
  is currently open

The exit countdown starts only when BOTH conditions are met simultaneously:

- No CLI request for `IDLE_TIMEOUT` duration
- No Extension WebSocket connection

If either signal is active, the daemon stays alive. This means:

- A connected Extension keeps the daemon alive indefinitely (user has Chrome open,
  likely still working)
- Recent CLI activity keeps the daemon alive even if Extension temporarily
  disconnects (Chrome restarting, Extension updating)

**Timeout value:** 4 hours by default.

```typescript
const DEFAULT_IDLE_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours
const IDLE_TIMEOUT = DEFAULT_IDLE_TIMEOUT;
```

**Timer implementation:**

```
resetIdleTimer():
  clear existing timer
  if Extension is connected:
    do not start timer (Extension connection keeps daemon alive)
    return
  start timer with IDLE_TIMEOUT duration
  on timeout: process.exit(0)

On CLI HTTP request:
  update lastRequestTime
  resetIdleTimer()

On Extension WebSocket connect:
  clear timer (Extension keeps daemon alive)

On Extension WebSocket disconnect:
  elapsed = now - lastRequestTime
  if elapsed >= IDLE_TIMEOUT:
    process.exit(0)  // CLI has been idle long enough already
  else:
    start timer with (IDLE_TIMEOUT - elapsed)  // count remaining time
```

### Extension Fast Reconnect

**Current behavior:** When the Extension loses its WebSocket connection to the
daemon, it reconnects with exponential backoff: 2s → 4s → 8s → 16s → 32s → 60s
(capped). In the worst case, the Extension waits up to 60 seconds before attempting
reconnection.

**New behavior:** Cap the backoff at 5 seconds instead of 60 seconds.

```typescript
// extension/src/background.ts
const WS_RECONNECT_MAX_DELAY = 5000; // was 60000
```

Rationale: with a 4-hour daemon timeout, the daemon is almost always running. Long
backoff intervals are unnecessary and only increase reconnection latency. A 5-second
cap means the Extension reconnects within 5 seconds of the daemon becoming available.

### Daemon Management Commands

Add three new CLI commands for daemon lifecycle management:

**`opencli daemon status`**

Queries the daemon's `/status` endpoint (new) and displays:

```
Daemon: running (PID 12345)
Uptime: 2h 15m
Extension: connected
Last CLI request: 8 min ago
Memory: 12.3 MB
Port: 19825
```

If daemon is not running:

```
Daemon: not running
```

**`opencli daemon stop`**

Sends a `POST /shutdown` request to the daemon, which triggers a graceful shutdown:
reject pending requests with a shutdown message, close WebSocket connections, close
HTTP server, then exit.

**`opencli daemon restart`**

Equivalent to `stop` followed by spawning a new daemon. Useful when the daemon gets
into a bad state.

**Daemon-side endpoints:**

- `GET /status` — returns JSON with PID, uptime, extension connection state, last
  request time, memory usage
- `POST /shutdown` — initiates graceful shutdown

Both endpoints require the same `X-OpenCLI` header as existing endpoints for CSRF
protection.

### CLI Connection Experience

**Current behavior:** When daemon is running but Extension is not connected, the CLI
silently polls every 300ms and eventually times out with a generic error.

**New behavior:** Show a progress indicator and actionable message:

```
⏳ Waiting for Chrome extension to connect...
   Make sure Chrome is open and the OpenCLI extension is enabled.
```

Poll interval reduced from 300ms to 200ms for slightly faster detection.

If the daemon is not running at all (connection refused), the CLI spawns it as before
and shows:

```
⏳ Starting daemon...
```

## Files Changed

| File | Change | Estimated LOC |
|------|--------|---------------|
| `src/daemon.ts` | Dual-condition idle timeout, `/status` endpoint, `/shutdown` endpoint | ~40 |
| `extension/src/background.ts` | `WS_RECONNECT_MAX_DELAY` 60000 → 5000 | 1 |
| `src/browser/daemon-client.ts` | Better connection-waiting UX, 200ms poll interval | ~20 |
| `src/commands/daemon.ts` (new) | `status`, `stop`, `restart` subcommands | ~80 |
| `src/constants.ts` | `DEFAULT_IDLE_TIMEOUT` constant | 2 |

**Total: ~143 lines of new/changed code.**

## Backward Compatibility

- No breaking changes to CLI commands or Extension protocol
- Existing `OPENCLI_DAEMON_PORT` environment variable continues to work
- The only observable behavior change: daemon stays alive longer
- New `daemon` subcommands are additive

## Testing

- Unit test: idle timer starts only when both CLI and Extension are idle
- Unit test: idle timer is cleared when Extension connects
- Unit test: `/status` returns correct state
- Unit test: `/shutdown` triggers graceful exit
- Integration test: daemon survives 10+ minutes without CLI requests while Extension
  is connected
- Integration test: daemon exits after configured timeout when fully idle
- Integration test: `opencli daemon status/stop/restart` work correctly

## Multi-Daemon Namespace Reservation

> **Note added 2026-04-16:** This section reserves namespace for future plugin-side daemon
> support. The implementation details below are NOT yet implemented.

### Motivation

Future OpenCLI adapters may need to spawn their own background daemons (e.g., custom IPC
bridges or services). The current design assumes a single `browser-bridge` daemon. We need
to reserve namespace so multiple daemons can coexist without breaking existing flags.

### Namespace Design

#### Daemon Naming

Each daemon has a unique name used for targeting:

| Daemon | Name | Default Port |
|--------|------|--------------|
| browser-bridge | `browser-bridge` | 19825 |
| (future plugins) | `<plugin-name>` | configurable |

#### CLI Surface Changes

All daemon subcommands accept an optional `[name]` argument:

```
opencli daemon status [name]
opencli daemon stop [name]
opencli daemon restart [name]
```

**Behavior when name is omitted:**
- `status`: Returns status for all known daemons, or `browser-bridge` if only one exists
- `stop` / `restart`: Requires explicit name when multiple daemons are running (error if ambiguous)

#### Status Response Format

**Single daemon (current behavior):**
```
Daemon: running (PID 12345)
Uptime: 2h 15m
Extension: connected
Last CLI request: 8 min ago
Memory: 12.3 MB
Port: 19825
```

**Multi-daemon status:**
```
Daemons:
  browser-bridge: running (PID 12345) - Extension: connected
  my-plugin: running (PID 67890) - Port: 19826

Run `opencli daemon status <name>` for detailed info on a specific daemon.
```

#### Discovery Mechanism

Plugin-side daemons register with a well-known file:

```
~/.opencli/daemons/<name>.json
```

Each file contains:
```json
{
  "name": "my-plugin",
  "pid": 12345,
  "port": 19826,
  "startedAt": "2026-04-16T10:00:00Z"
}
```

The `opencli daemon` commands enumerate registered daemons from this directory.

#### Implementation Notes

1. **Backward compatibility:** Current behavior is `name = browser-bridge` implicit
2. **Registration:** Daemon writes its info file on startup, removes on graceful exit
3. **Cleanup:** Orphaned pidfiles (daemon crashed) are detected via `kill(pid, 0)` check
4. **Security:** Daemon files are user-writable only; path traversal is prevented

### Future Considerations

- Daemon health check endpoint: `GET /health` returns `{ "ok": true }`
- Daemon registry service for multi-machine setups
- OS-level integration (launchd plists, systemd units)

## Out of Scope

- OS-level daemon management (launchd/systemd) — can be added later if needed
- Daemon auto-update mechanism
- Persistent daemon state across restarts
- Plugin daemon registration API (reserved namespace only, implementation TBD)
