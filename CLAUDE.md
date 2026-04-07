# OpenCLI — Agent Instructions

## Self-Repair Protocol

When you use `opencli <site> <command>` and the command **fails**, do not just report the error. Automatically diagnose and fix the adapter, then retry.

### Protocol

1. **Collect diagnostics** — re-run the failing command with diagnostic mode:
   ```bash
   OPENCLI_DIAGNOSTIC=1 opencli <site> <command> [args...] 2>diag.json
   ```
   This emits a `RepairContext` JSON between `___OPENCLI_DIAGNOSTIC___` markers in stderr, containing: error code, adapter source path + code, DOM snapshot, network requests, and console errors.

2. **Read the adapter source** — use `RepairContext.adapter.sourcePath` to locate the exact file to fix. This is the authoritative path — it may be in the repo (`clis/weibo/hot.ts`) or in the user's adapter directory (`~/.opencli/clis/weibo/hot.ts`). Always use the path from the diagnostic, not a guessed repo-relative path.

3. **Diagnose the root cause** — cross-reference the error with what the adapter expects vs. what the page/API actually provides:
   - `SELECTOR` — DOM element not found → selector changed
   - `EMPTY_RESULT` — no data returned → API response schema changed
   - `API_ERROR` / `NETWORK` — endpoint moved or broke
   - `COMMAND_EXEC` — runtime error in adapter logic
   - `TIMEOUT` — page loads differently
   - `PAGE_CHANGED` — major page restructuring

4. **Fix the adapter** — make the minimal change needed. Common fixes:
   - Update CSS selectors to match current DOM
   - Update API endpoint URLs
   - Update response field paths (e.g., `data.results` → `data.items`)
   - Update wait conditions

5. **Retry the original command** — run the exact same command that failed.

6. **Repeat if needed** — max **3 repair rounds**. If the same error persists after a fix, try a different approach. After 3 rounds, stop and report what was tried.

### Scope Constraint

**Only modify the adapter file identified by `RepairContext.adapter.sourcePath`.** This will be under one of:
- `clis/<site>/` — repo-local adapters
- `~/.opencli/clis/<site>/` — user-local adapters (npm install scenario)

The repair target is always the path from the diagnostic output, not a guessed path.

**Never modify** `src/`, `extension/`, `tests/`, `autoresearch/`, `package.json`, or `tsconfig.json` during self-repair. These are core infrastructure — adapter failures are almost always caused by site changes, not core bugs.

### When NOT to Self-Repair

Stop immediately and report to the user (do not modify code) if:
- **`AUTH_REQUIRED`** (exit code 77) — user needs to log into the site in Chrome
- **`BROWSER_CONNECT`** (exit code 69) — browser bridge not running, tell user to run `opencli doctor`
- **CAPTCHA / rate limiting** — not an adapter issue
- **Feature removed by site** — the data no longer exists

### Deeper Exploration

If the diagnostic context isn't enough to understand what changed, use `opencli operate` to inspect the live page:

```bash
# Open the page and get current DOM state
opencli operate open <url> && opencli operate state

# Check network requests triggered by an interaction
opencli operate click <N> && opencli operate network
```

For the full repair workflow, load the `opencli-repair` skill.

## Project Structure

- `src/` — Core runtime (TypeScript, published as npm package `@jackwener/opencli`)
- `clis/` — Site adapters (81 sites, user-local, high frequency of breakage from site changes)
- `extension/` — Chrome extension (Browser Bridge)
- `skills/` — AI agent skill definitions
- `autoresearch/` — AI-powered research and eval infrastructure

## Build & Test

```bash
npm run build        # TypeScript compile + manifest generation
npm run typecheck    # Type checking only
npm test             # Run vitest unit tests
npm run test:adapter # Adapter-specific tests
```
