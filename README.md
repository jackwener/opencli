# OpenCLI

> **Make any website your CLI.**  
> Zero risk · Reuse Chrome login · AI-powered discovery · 80+ commands · 19 sites

[中文文档](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/@jackwener/opencli?style=flat-square)](https://www.npmjs.com/package/@jackwener/opencli)
[![Node.js Version](https://img.shields.io/node/v/@jackwener/opencli?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/@jackwener/opencli?style=flat-square)](./LICENSE)

A CLI tool that turns **any website** into a command-line interface — Bilibili, Zhihu, 小红书, Twitter/X, Reddit, YouTube, and [many more](#built-in-commands) — powered by browser session reuse and AI-native discovery.

---

## Table of Contents

- [Highlights](#highlights)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Built-in Commands](#built-in-commands)
- [Output Formats](#output-formats)
- [For AI Agents (Developer Guide)](#for-ai-agents-developer-guide)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Releasing New Versions](#releasing-new-versions)
- [License](#license)

---

## Highlights

- **Account-safe** — Reuses Chrome's logged-in state; your credentials never leave the browser.
- **AI Agent ready** — `explore` discovers APIs, `synthesize` generates adapters, `cascade` finds auth strategies.
- **Self-healing setup** — `opencli setup` auto-discovers tokens; `opencli doctor` diagnoses config across 10+ tools; `--fix` repairs them all.
- **Dynamic Loader** — Simply drop `.ts` or `.yaml` adapters into the `clis/` folder for auto-registration.
- **Dual-Engine Architecture** — Supports both YAML declarative data pipelines and robust browser runtime TypeScript injections.

## Prerequisites

- **Node.js**: >= 18.0.0
- **Chrome** running **and logged into the target site** (e.g. bilibili.com, zhihu.com, xiaohongshu.com).

> **⚠️ Important**: Browser commands reuse your Chrome login session. You must be logged into the target website in Chrome before running commands. If you get empty data or errors, check your login status first.

OpenCLI connects to your browser through the Playwright MCP Bridge extension.

### Playwright MCP Bridge Extension Setup

1. Install **[Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm)** extension in Chrome.
2. Run `opencli setup` — it auto-discovers your token and lets you choose which tools to configure:

```bash
opencli setup
```

The interactive TUI will:
- 🔍 Auto-discover `PLAYWRIGHT_MCP_EXTENSION_TOKEN` from Chrome (no manual copy needed)
- ☑️ Show all detected tools (Codex, Cursor, Claude Code, Gemini CLI, etc.)
- ✏️ Update only the files you select (Space to toggle, Enter to confirm)

<details>
<summary>Manual setup (alternative)</summary>

Add token to your MCP client config (e.g. Claude/Cursor):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--extension"],
      "env": {
        "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "<your-token-here>"
      }
    }
  }
}
```

Export in shell (e.g. `~/.zshrc`):

```bash
export PLAYWRIGHT_MCP_EXTENSION_TOKEN="<your-token-here>"
```

</details>

Verify with `opencli doctor` — shows colored status for extension install, token consistency, and all config locations:

```bash
opencli doctor            # Token & config diagnosis
opencli doctor --live     # Also test live browser connectivity
opencli doctor --fix      # Fix mismatched configs (interactive confirmation)
opencli doctor --fix -y   # Fix all configs non-interactively
```

## Quick Start

### Install via npm (recommended)

```bash
npm install -g @jackwener/opencli
opencli setup   # One-time: configure Playwright MCP token
```

Then use directly:

```bash
opencli list                              # See all commands
opencli list -f yaml                      # List commands as YAML
opencli hackernews top --limit 5          # Public API, no browser
opencli bilibili hot --limit 5            # Browser command
opencli zhihu hot -f json                 # JSON output
opencli zhihu hot -f yaml                 # YAML output
```

### Install from source (for developers)

```bash
git clone git@github.com:jackwener/opencli.git
cd opencli 
npm install
npm run build
npm link      # Link binary globally
opencli list  # Now you can use it anywhere!
```

### Update

```bash
npm install -g @jackwener/opencli@latest
```

## Built-in Commands

**19 sites · 80+ commands** — run `opencli list` for the live registry.

| Site | Commands | Count | Mode |
|------|----------|:-----:|------|
| **twitter** | `trending` `bookmarks` `profile` `search` `timeline` `thread` `following` `followers` `notifications` `post` `reply` `delete` `like` `article` `follow` `unfollow` `bookmark` `unbookmark` | 18 | 🔐 Browser |
| **reddit** | `hot` `frontpage` `popular` `search` `subreddit` `read` `user` `user-posts` `user-comments` `upvote` `save` `comment` `subscribe` `saved` `upvoted` | 15 | 🔐 Browser |
| **bilibili** | `hot` `search` `me` `favorite` `history` `feed` `subtitle` `dynamic` `ranking` `following` `user-videos` | 11 | 🔐 Browser |
| **v2ex** | `hot` `latest` `topic` `daily` `me` `notifications` | 6 | 🌐 / 🔐 |
| **xueqiu** | `feed` `hot-stock` `hot` `search` `stock` `watchlist` | 6 | 🔐 Browser |
| **xiaohongshu** | `search` `notifications` `feed` `me` `user` | 5 | 🔐 Browser |
| **youtube** | `search` `video` `transcript` | 3 | 🔐 Browser |
| **zhihu** | `hot` `search` `question` | 3 | 🔐 Browser |
| **boss** | `search` `detail` | 2 | 🔐 Browser |
| **coupang** | `search` `add-to-cart` | 2 | 🔐 Browser |
| **bbc** | `news` | 1 | 🌐 Public |
| **ctrip** | `search` | 1 | 🔐 Browser |
| **github** | `search` | 1 | 🌐 Public |
| **hackernews** | `top` | 1 | 🌐 Public |
| **linkedin** | `search` | 1 | 🔐 Browser |
| **reuters** | `search` | 1 | 🔐 Browser |
| **smzdm** | `search` | 1 | 🔐 Browser |
| **weibo** | `hot` | 1 | 🔐 Browser |
| **yahoo-finance** | `quote` | 1 | 🔐 Browser |

## Output Formats

All built-in commands support `--format` / `-f` with `table`, `json`, `yaml`, `md`, and `csv`.
The `list` command supports the same format options, and keeps `--json` for backward compatibility.

```bash
opencli list -f yaml            # Command registry as YAML
opencli bilibili hot -f table   # Default: rich terminal table
opencli bilibili hot -f json    # JSON (pipe to jq or LLMs)
opencli bilibili hot -f yaml    # YAML (human-readable structured output)
opencli bilibili hot -f md      # Markdown
opencli bilibili hot -f csv     # CSV
opencli bilibili hot -v         # Verbose: show pipeline debug steps
```

## For AI Agents (Developer Guide)

If you are an AI assistant tasked with creating a new command adapter for `opencli`, please follow the AI Agent workflow below:

> **Quick mode**: To generate a single command for a specific page URL, see [CLI-ONESHOT.md](./CLI-ONESHOT.md) — just a URL + one-line goal, 4 steps done.

> **Full mode**: Before writing any adapter code, read [CLI-EXPLORER.md](./CLI-EXPLORER.md). It contains the complete browser exploration workflow, the 5-tier authentication strategy decision tree, and debugging guide.

```bash
# 1. Deep Explore — discover APIs, infer capabilities, detect framework
opencli explore https://example.com --site mysite

# 2. Synthesize — generate YAML adapters from explore artifacts
opencli synthesize mysite

# 3. Generate — one-shot: explore → synthesize → register
opencli generate https://example.com --goal "hot"

# 4. Strategy Cascade — auto-probe: PUBLIC → COOKIE → HEADER
opencli cascade https://api.example.com/data
```

Explore outputs to `.opencli/explore/<site>/` (manifest.json, endpoints.json, capabilities.json, auth.json).

## Testing

See **[TESTING.md](./TESTING.md)** for the full testing guide, including:

- Current test coverage (unit + E2E tests across 19 sites)
- How to run tests locally
- How to add tests when creating new adapters
- CI/CD pipeline with sharding
- Headless browser mode (`OPENCLI_HEADLESS=1`)

```bash
# Quick start
npm run build
npx vitest run                              # All tests
npx vitest run src/                          # Unit tests only
npx vitest run tests/e2e/                    # E2E tests
```

## Troubleshooting

- **"Failed to connect to Playwright MCP Bridge"**
  - Ensure the Playwright MCP extension is installed and **enabled** in your running Chrome.
  - Restart the Chrome browser if you just installed the extension.
- **Empty data returns or 'Unauthorized' error**
  - Your login session in Chrome might have expired. Open a normal Chrome tab, navigate to the target site, and log in or refresh the page to prove you are human.
- **Node API errors**
  - Make sure you are using Node.js >= 18. Some dependencies require modern Node APIs.
- **Token issues**
  - Run `opencli doctor` to diagnose token configuration across all tools.

## Releasing New Versions

```bash
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
git push --follow-tags
```

The CI will automatically build, create a GitHub release, and publish to npm.

## License

[Apache-2.0](./LICENSE)
