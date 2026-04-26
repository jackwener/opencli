# Plugin-Side Daemons

This guide covers how to spawn background daemons from OpenCLI plugins. This pattern is
used by the built-in `browser-bridge` daemon and can be adapted for plugin-specific
background services.

## When to Use a Plugin Daemon

Consider a plugin daemon when your plugin needs:

- A long-running process that persists across CLI invocations
- A server (HTTP, WebSocket, IPC) that other processes connect to
- Background processing that shouldn't block CLI commands

**Example use cases:**
- Custom browser automation services
- Local HTTP servers exposing plugin-specific APIs
- IPC bridges to external tools or services

## Verified Spawn Pattern

The following pattern has been tested and proven stable across macOS and Linux:

```typescript
import { spawn } from 'node:child_process';

this._daemonProc = spawn(spawnArgs[0], spawnArgs.slice(1), {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env },
});
this._daemonProc.unref();
```

**Source:** `src/browser/bridge.ts:132-137`

### Key Properties Explained

| Property | Value | Purpose |
|----------|-------|---------|
| `detached: true` | Boolean | Creates a new process group, allowing the daemon to outlive the parent |
| `stdio: 'ignore'` | String | Prevents stdin/stdout/stderr pipes from keeping the parent alive |
| `.unref()` | Method | Removes the parent's reference to the child, so parent exit doesn't kill daemon |
| `env: { ...process.env }` | Object | Daemon inherits the caller's environment (including `OPENCLI_*` vars and `PATH`) |

### Why `detached: true` + `stdio: 'ignore'`

This combination is sufficient for most use cases:

1. **`detached: true`** detaches the child process from the parent's process group
2. **`stdio: 'ignore'`** prevents the parent's file descriptors from being inherited
3. **`.unref()`** removes the parent's reference to the child

Together, these ensure the daemon survives when the CLI exits. **No `setsid` or explicit
process group management is needed** on macOS or Linux.

### Environment Inheritance

```typescript
env: { ...process.env }
```

This is intentional. The daemon inherits:
- `OPENCLI_*` environment variables (plugin-specific configuration)
- `PATH` (required for finding executables)
- Any other variables set by the user or system

If you need a clean environment, explicitly set only required variables:

```typescript
env: {
  PATH: process.env.PATH,
  MY_PLUGIN_VAR: 'value',
}
```

### Lazy Spawning

Spawn the daemon from the CLI entry point, not at module import time:

```typescript
// ✅ Good: spawn when adapter actually runs
class MyAdapter {
  private daemon: ChildProcess | null = null;

  async connect() {
    if (!this.daemon) {
      this.daemon = spawn(/* ... */);
    }
  }
}

// ❌ Avoid: spawn at import time
const daemon = spawn(/* ... */); // Runs even if adapter never used
```

Lazy spawning ensures:
- Fast module loading
- No daemon startup for commands that don't need it
- Proper integration with CLI timeout/idle logic

## Daemon Communication

### HTTP Server Pattern

Most plugin daemons expose an HTTP API:

```typescript
import http from 'node:http';

const server = http.createServer((req, res) => {
  // Handle requests
});

server.listen(port, () => {
  console.log(`Daemon listening on port ${port}`);
});
```

### Port Selection

Use a configurable port with a default:

```typescript
const DEFAULT_PORT = 19826; // Avoid default browser-bridge port (19825)

const port = parseInt(process.env.MY_PLUGIN_PORT || String(DEFAULT_PORT), 10);
```

## Lifecycle Integration

### Status Reporting

When `opencli daemon status` is implemented, your daemon should respond to:

```
GET /status
```

Return JSON with daemon information:

```json
{
  "name": "my-plugin",
  "pid": 12345,
  "uptime": 7200000,
  "port": 19826
}
```

### Graceful Shutdown

Handle `SIGTERM` for clean shutdowns:

```typescript
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
```

## Multi-Daemon Considerations

When multiple daemons may run simultaneously:

1. **Use unique ports** for each daemon
2. **Register daemon info** for discovery (future enhancement planned)
3. **Handle port conflicts** gracefully with clear error messages

### Port Allocation Strategy

| Daemon | Default Port | Environment Variable |
|--------|--------------|---------------------|
| browser-bridge | 19825 | `OPENCLI_DAEMON_PORT` |
| plugin (choose) | 19826+ | `MY_PLUGIN_PORT` |

## Testing Your Plugin Daemon

1. **Start manually:** Run your plugin and verify the daemon spawns
2. **Check status:** Verify daemon is listening on expected port
3. **Test isolation:** Run multiple CLI commands; daemon should persist
4. **Clean shutdown:** Verify daemon exits when parent exits or on explicit stop

## Related Documentation

- [Daemon Lifecycle Redesign Spec](../superpowers/specs/2026-03-31-daemon-lifecycle-redesign.md)
- [Architecture Overview](./architecture.md)
- [TypeScript Adapter](./ts-adapter.md)
