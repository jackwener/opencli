# Design: Codex `new --project` + Manifest Factory Pattern Fix

**Date**: 2026-04-19
**Status**: Approved, pre-implementation
**Branch**: `fix/manifest-factory-pattern`
**Scope**: Two coupled changes across `src/build-manifest.ts` + `clis/codex/new.js`

## 1. Problem

Two problems, one is the prerequisite of the other.

### 1.1 Upstream bug — factory-style adapters never register

`src/build-manifest.ts:58` uses the regex `CLI_MODULE_PATTERN = /\bcli\s*\(/` to decide whether a file under `clis/<site>/` is a CLI definition. Files that only invoke factory helpers (`makeStatusCommand`, `makeNewCommand`, `makeDumpCommand`, `makeScreenshotCommand`) from `clis/_shared/desktop-commands.js` contain no literal `cli(` token, so `loadManifestEntries` silently returns `[]` for them (`build-manifest.ts:116`).

**Affected adapters** (upstream `jackwener/opencli@main`, verified 2026-04-19):

| Site | Missing commands |
|------|------------------|
| codex | `status`, `new`, `dump`, `screenshot` |
| cursor | `status`, `new`, `dump`, `screenshot` |
| chatwise | `status`, `new`, `dump`, `screenshot` |

The shipped `cli-manifest.json` in upstream contains **neither** the commands nor any warning about the skipped files. Every user of these adapters hits "unknown command" and has no hint that the files exist.

### 1.2 `opencli codex new` cannot target a specific project

Codex Desktop is a single-window multi-project Electron app. Its sidebar lists projects (`Main`, `predict`, `cryptoArbitrage`, ...), and `Cmd+N` creates a new chat under **whichever project is currently selected**. Today `opencli codex new` sends `Cmd+N` unconditionally, so the chat ends up wherever the window happens to be focused — random from the user's perspective.

## 2. Goal

- Make `make[A-Z]\w*Command(...)`-style adapter files visible to `build-manifest`.
- Add `opencli codex new --project <name>` that switches the Codex sidebar to the named project before sending `Cmd+N`.
- Refuse ambiguous or missing matches loudly: exact match, exit non-zero on miss, print the list of projects Codex actually shows so the user can see the correct spelling.

## 3. Architectural Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Expand `CLI_MODULE_PATTERN` to `/\bcli\s*\(|\bmake[A-Z]\w*Command\s*\(/` | Matches the existing "PascalCase + Command suffix" factory convention; narrow enough not to collide with arbitrary `make*` functions. |
| D2 | Match project names **case-sensitive**, trim whitespace on input only | "Exact" per jdy's instruction; trim is a safety net for shell paste hiccups. |
| D3 | On miss: throw with the list of detected projects, exit 1 | Script-friendly (non-zero) + human-friendly (wrong spelling becomes obvious). |
| D4 | Rewrite `clis/codex/new.js` inline (`cli({...})`) rather than keep `makeNewCommand` | The factory has no slot for custom `args`; once customization starts, inline is simpler than extending the factory. |
| D5 | Leave `codex/status.js`, `codex/dump.js`, `codex/screenshot.js` untouched | They benefit from the pattern fix automatically; no reason to churn them. |
| D6 | Read sidebar live every run, no cache | Project list mutates (add/remove); cache would go stale; one read per run is cheap. |
| D7 | `scrollIntoViewIfNeeded` before clicking the project row | Defensive for virtualized or long sidebars. |
| D8 | Do **not** restore sidebar selection on `Cmd+N` failure | Switching the sidebar IS a successful side-effect; rollback logic adds complexity for near-zero value. |
| D9 | Single branch, two commits (`fix(manifest):`, `feat(codex):`); cherry-pick fix commit to upstream PR later | Fix benefits everyone (upstream); feat uses jdy-specific project names (fork-local). |
| D10 | Unit test for the pattern fix; `codex new` is manual test only | Electron CDP automation is out of scope for this change. |

## 4. Components & Changes

### 4.1 `src/build-manifest.ts`

One-line change at line 58:

```ts
// Before
const CLI_MODULE_PATTERN = /\bcli\s*\(/;

// After
// Recognize both inline `cli({...})` definitions and factory wrappers
// from clis/_shared/desktop-commands.js (makeStatusCommand, makeNewCommand, ...).
const CLI_MODULE_PATTERN = /\bcli\s*\(|\bmake[A-Z]\w*Command\s*\(/;
```

### 4.2 `src/build-manifest.test.ts`

Add a test case: write a temporary adapter file whose only CLI-like token is `export const x = makeFooCommand('site', ...)`, call `loadManifestEntries`, assert that it returns ≥1 entry. Without the fix the test fails (returns `[]`).

### 4.3 `clis/codex/new.js`

Replace the two-line factory delegation with an inline `cli({...})` that:

1. If `--project` provided, `listSidebarProjects(page)` → enumerate sidebar project names.
2. Reject miss: throw with the detected list.
3. On hit: `clickProject(page, target)` with `scrollIntoViewIfNeeded` + click + short wait.
4. Always: `pressKey(Cmd+N on mac, Ctrl+N elsewhere)`, `wait(1)`, return row.

Skeleton (the two helpers' internals depend on the dump and are filled after step 5.4 below):

```js
import { cli, Strategy } from '@jackwener/opencli/registry';

async function listSidebarProjects(page) {
  // Filled after `opencli codex dump` reveals the real DOM/a11y shape.
}

async function clickProject(page, name) {
  // Filled after dump. Must scrollIntoViewIfNeeded before click.
}

export const newCommand = cli({
  site: 'codex',
  name: 'new',
  description: 'Start a new Codex chat; optionally scope to a specific sidebar project',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'project',
      type: 'str',
      required: false,
      valueRequired: true,
      help: 'Exact sidebar project name to switch to before creating the chat (case-sensitive)',
    },
  ],
  columns: ['Status', 'Project'],
  func: async (page, kwargs) => {
    const target = kwargs.project ? kwargs.project.trim() : null;
    if (target) {
      const available = await listSidebarProjects(page);
      if (!available.includes(target)) {
        const list = available.length
          ? available.map((n) => `  - ${n}`).join('\n')
          : '  (none detected — is the sidebar collapsed?)';
        throw new Error(
          `Project '${target}' not found in Codex sidebar.\nAvailable projects:\n${list}`,
        );
      }
      await clickProject(page, target);
    }
    const isMac = process.platform === 'darwin';
    await page.pressKey(isMac ? 'Meta+N' : 'Control+N');
    await page.wait(1);
    return [{ Status: 'Success', Project: target || '(current)' }];
  },
});
```

## 5. Data Flow

### 5.1 Happy path

```
user: opencli codex new --project Main
  → opencli CLI → manifest → load clis/codex/new.js
  → func(page, {project: "Main"})
    → listSidebarProjects(page) → ["cryptoArbitrage", "predict", "Main"]
    → "Main" ∈ list ✓
    → clickProject(page, "Main") → sidebar highlights Main, composer label flips to "Main"
    → pressKey(Meta+N) → Codex opens blank chat under Main
    → wait(1)
  → row: [{Status: Success, Project: Main}]
```

### 5.2 Miss path

```
user: opencli codex new --project main
  → listSidebarProjects → ["cryptoArbitrage", "predict", "Main"]
  → "main" ∉ list (case-sensitive mismatch)
  → throw Error → stderr:
      Project 'main' not found in Codex sidebar.
      Available projects:
        - cryptoArbitrage
        - predict
        - Main
  → exit 1
```

### 5.3 Backward-compat path

```
user: opencli codex new          (no --project)
  → target = null
  → skip sidebar interaction
  → pressKey(Meta+N) directly → existing behaviour preserved
```

## 6. Execution Sequence (implementation preview — not yet run)

1. `git fetch origin && git checkout -b fix/manifest-factory-pattern origin/main` — done during brainstorming.
2. Edit `src/build-manifest.ts:58`.
3. `npm run build` → `dist/` + fresh `cli-manifest.json`. Assert `cli-manifest.json` now contains `codex/status`, `codex/new`, `codex/dump`, `codex/screenshot` (plus cursor/chatwise equivalents).
4. Run `opencli codex dump` against the live Codex window. This writes `/tmp/codex-dom.html` and `/tmp/codex-snapshot.json`. Read both, identify the sidebar project row's selector/role.
5. Fill `listSidebarProjects` and `clickProject` in `clis/codex/new.js` based on the real DOM.
6. `npm run build` again.
7. Manual verification (three cases):
   - `opencli codex new --project Main` — chat appears under Main.
   - `opencli codex new --project nonsense` — stderr lists projects, exit 1.
   - `opencli codex new` — behaves as before.
8. Add pattern fix unit test in `src/build-manifest.test.ts`; `npm test`.
9. Commits:
   - `fix(manifest): recognize factory-style adapters (make*Command)` — step 2 + step 8.
   - `feat(codex): add --project flag to new for targeted session creation` — step 5.
10. `git push -u origin fix/manifest-factory-pattern` → open PR to `ken-zy/OpenCLI:main`.
11. After merge, cherry-pick the `fix(manifest):` commit onto a clean branch off `upstream/main` and open an upstream PR to `jackwener/opencli`.

## 7. Error Handling & Edge Cases

| Situation | Behaviour |
|-----------|-----------|
| CDP endpoint unreachable / Codex not running | Error from Strategy.UI layer surfaces as-is (already covered). No new handling. |
| Sidebar collapsed or not rendered | `listSidebarProjects` returns `[]`, miss-path prints "(none detected — is the sidebar collapsed?)". |
| Project name contains spaces or unicode | User quotes in shell: `--project 'My Project'`. Exact match + trim handles it. |
| Project name is empty string (`--project ""`) | Treated as no target (trimmed to `""`, then falsy); equivalent to no `--project`. This is deliberate: empty should not match any project. |
| Click succeeds but `Cmd+N` fails | Sidebar stays on the switched project; user can retry. No rollback (D8). |
| Multiple Codex windows | Out of scope — Codex is single-window. |

## 8. Testing

- **Unit**: `src/build-manifest.test.ts` gains a factory-pattern case. Should fail pre-fix, pass post-fix.
- **Manual**: three cases in §6.7. Tester must have Codex Desktop running with at least two projects visible in the sidebar.
- **Regression**: `npm test` full suite should pass — the pattern is strictly broader, no existing match is invalidated.

## 9. Known Unknowns (resolved by dump, not in this doc)

- Exact DOM shape of sidebar project rows: ARIA role (`treeitem` / `button` / plain `div`), label source (`aria-label` / text content / `data-*`), parent container scoping.
- Whether the "项目" / "Projects" header is collapsible, and whether it's collapsed by default in some states.
- Whether Codex virtualizes the project list when it grows (D7's `scrollIntoViewIfNeeded` already hedges against this).
- Post-click wait time for Codex to complete the context switch before `Cmd+N` is meaningful (currently a literal `wait(1)`; may tune down to `0.3` or up to `2` after measurement).

## 10. Out of Scope (YAGNI)

- Adding `--project` to `cursor new` / `chatwise new` (separate request).
- Fuzzy / case-insensitive / alias matching for `--project`.
- Modifying Codex CDP connection or auto-launch logic.
- Changing the existing `makeStatusCommand` / `makeNewCommand` factories themselves.
- Adding telemetry or warnings to `build-manifest` for skipped files (a separate upstream improvement).

## 11. Upstream PR Split (post-merge)

Once this PR lands in `ken-zy/OpenCLI:main`:

- Create `fix/manifest-factory-pattern-for-upstream` off `upstream/main` (name avoids the `upstream/` prefix that collides with the remote-tracking ref).
- Cherry-pick the `fix(manifest):` commit alone (plus its unit test).
- Open PR to `jackwener/opencli:main` with body explaining the silent-skip bug + the three affected sites + the unit test.
- The `feat(codex):` commit stays in the fork.
