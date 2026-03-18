# Contributing to OpenCLI

Thanks for your interest in contributing to OpenCLI! This guide covers everything you need to get started.

## Quick Start

```bash
# 1. Fork & clone
git clone git@github.com:<your-username>/opencli.git
cd opencli

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Link globally (optional, for testing `opencli` command)
npm link

# 5. Run tests
npx vitest run src/        # Unit tests
npx vitest run tests/e2e/  # E2E tests (needs build first)
```

## Project Structure

```
src/
├── main.ts              # CLI entry point (Commander.js)
├── engine.ts            # Command discovery & execution
├── registry.ts          # Command registration
├── output.ts            # Multi-format output (table/json/yaml/md/csv)
├── browser/             # Playwright MCP browser layer
│   ├── mcp.ts           # Process + JSON-RPC transport
│   ├── page.ts          # IPage implementation
│   ├── discover.ts      # MCP path + CDP endpoint discovery
│   ├── errors.ts        # Connection diagnostics
│   └── tabs.ts          # Tab lifecycle management
├── pipeline/            # YAML declarative data pipeline engine
│   ├── executor.ts      # Pipeline runner
│   ├── template.ts      # Expression interpolation
│   └── steps/           # Step handlers (fetch, browser, intercept, etc.)
├── clis/                # Site adapters (19 sites, 80+ commands)
│   ├── hackernews/      # Example: YAML-only adapter
│   ├── twitter/         # Example: TypeScript adapter
│   └── ...
├── doctor.ts            # Token & config diagnostics
├── explore.ts           # AI-powered site discovery
└── *.test.ts            # Unit tests (co-located)
```

## Adding a New Site Adapter

This is the most common type of contribution. OpenCLI supports two adapter formats:

### YAML Adapter (Recommended for data-fetching commands)

Best for commands that fetch data from public or cookie-authenticated APIs.

Create a file like `src/clis/<site>/<command>.yaml`:

```yaml
site: mysite
name: trending
description: Trending posts on MySite
domain: www.mysite.com
strategy: public      # public | cookie | header
browser: false        # true if browser session is needed

args:
  limit:
    type: int
    default: 20
    description: Number of items

pipeline:
  - fetch:
      url: https://api.mysite.com/trending

  - map:
      rank: ${{ index + 1 }}
      title: ${{ item.title }}
      score: ${{ item.score }}
      url: ${{ item.url }}

  - limit: ${{ args.limit }}

columns: [rank, title, score, url]
```

See [`hackernews/top.yaml`](src/clis/hackernews/top.yaml) for a complete real-world example.

### TypeScript Adapter (For complex browser interactions)

Best for commands that need JavaScript injection, multi-step flows, or write operations (post, like, follow).

Create a file like `src/clis/<site>/<command>.ts`:

```typescript
import { cli, Strategy } from '../../registry.js';

cli({
  site: 'mysite',
  name: 'search',
  description: 'Search MySite',
  domain: 'www.mysite.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', required: true, help: 'Search query' },
    { name: 'limit', type: 'int', default: 10, help: 'Max results' },
  ],
  columns: ['title', 'url', 'date'],

  func: async (page, kwargs) => {
    const { query, limit = 10 } = kwargs;
    await page.goto('https://www.mysite.com');

    const data = await page.evaluate(`
      (async () => {
        const res = await fetch('/api/search?q=${encodeURIComponent(query)}', {
          credentials: 'include'
        });
        return (await res.json()).results;
      })()
    `);

    return data.slice(0, Number(limit)).map((item: any) => ({
      title: item.title,
      url: item.url,
      date: item.created_at,
    }));
  },
});
```

### Choosing Between YAML and TypeScript

| Criteria | YAML | TypeScript |
|----------|------|------------|
| Simple GET + transform | ✅ | Overkill |
| Needs browser cookies | ✅ (`browser: true`) | ✅ |
| Multi-step flow | ❌ | ✅ |
| Write operations (post, like) | ❌ | ✅ |
| Complex JS injection | ❌ | ✅ |

> **Tip**: Use `opencli explore <url>` to discover APIs and `opencli cascade <api-url>` to find the right auth strategy. See [CLI-EXPLORER.md](./CLI-EXPLORER.md) for the full workflow.

### Validate Your Adapter

```bash
# Validate YAML syntax and schema
opencli validate

# Test your command
opencli <site> <command> --limit 3 -f json

# Verbose mode for debugging
opencli <site> <command> -v
```

## Testing

See [TESTING.md](./TESTING.md) for the full testing guide.

### Where to Add Tests

| Adapter Type | Test File |
|---|---|
| Public API (`browser: false`) | `tests/e2e/public-commands.test.ts` |
| Browser, public data | `tests/e2e/browser-public.test.ts` |
| Browser, needs login | `tests/e2e/browser-auth.test.ts` |
| Internal module | `src/<module>.test.ts` (co-located) |

### Running Tests

```bash
npx vitest run src/           # Unit tests
npx vitest run tests/e2e/     # E2E tests
npx vitest run                # All tests
npx vitest src/               # Watch mode
```

## Code Style

- **TypeScript strict mode** — avoid `any` where possible.
- **ES Modules** — use `.js` extensions in imports (TypeScript output).
- **Naming**: `kebab-case` for files, `camelCase` for variables/functions, `PascalCase` for types/classes.
- **No default exports** — use named exports.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(twitter): add thread command
fix(browser): handle CDP timeout gracefully
docs: update CONTRIBUTING.md
test(reddit): add e2e test for save command
chore: bump vitest to v4
```

Common scopes: site name (`twitter`, `reddit`), module name (`browser`, `pipeline`, `engine`), or omit for broad changes.

## Submitting a Pull Request

1. Create a feature branch: `git checkout -b feat/mysite-trending`
2. Make your changes and add tests
3. Run checks:
   ```bash
   npx tsc --noEmit           # Type check
   npx vitest run src/        # Unit tests
   opencli validate           # YAML validation (if applicable)
   ```
4. Commit using conventional commit format
5. Push and open a PR — the [PR template](/.github/pull_request_template.md) will guide you through the checklist

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](./LICENSE).
