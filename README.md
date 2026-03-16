# OpenCLI

> **Make any website your CLI.**  
> Zero risk · Reuse Chrome login · AI-powered discovery

[中文文档](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/@jackwener/opencli?style=flat-square)](https://www.npmjs.com/package/@jackwener/opencli)
[![Node.js Version](https://img.shields.io/node/v/@jackwener/opencli?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/@jackwener/opencli?style=flat-square)](./LICENSE)

A CLI tool that turns **any website** into a command-line interface. **50 commands** across **17 sites** — bilibili, zhihu, xiaohongshu, twitter, reddit, xueqiu, v2ex, hackernews, bbc, weibo, boss, yahoo-finance, reuters, smzdm, ctrip, youtube, coupang — powered by browser session reuse and AI-native discovery.

---

## Table of Contents

- [Highlights](#highlights)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Built-in Commands](#built-in-commands)
- [Output Formats](#output-formats)
- [For AI Agents (Developer Guide)](#for-ai-agents-developer-guide)
- [Troubleshooting](#troubleshooting)
- [Releasing New Versions](#releasing-new-versions)
- [License](#license)

---

## Highlights

- **Account-safe** — Reuses Chrome's logged-in state; your credentials never leave the browser.
- **AI Agent ready** — `explore` discovers APIs, `synthesize` generates adapters, `cascade` finds auth strategies.
- **Dynamic Loader** — Simply drop `.ts` or `.yaml` adapters into the `clis/` folder for auto-registration.
- **Dual-Engine Architecture** — Supports both YAML declarative data pipelines and robust browser runtime typescript injections.

## Prerequisites

- **Node.js**: >= 18.0.0
- **Chrome** running **and logged into the target site** (e.g. bilibili.com, zhihu.com, xiaohongshu.com).

> **⚠️ Important**: Browser commands reuse your Chrome login session. You must be logged into the target website in Chrome before running commands. If you get empty data or errors, check your login status first.

OpenCLI needs a way to communicate with your browser. We highly recommend configuring **both** of the following methods for maximum reliability.

### Connection Method A: Playwright MCP Bridge Extension (Primary)

1. Install **[Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm)** extension in Chrome.
2. Obtain your token by clicking the extension icon in the browser toolbar or from the extension settings page.

**You must configure this token in BOTH your MCP configuration AND system environment variables.**

First, add it to your MCP client config (e.g. Claude/Cursor):

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

And, so that `opencli` commands can use it directly in the terminal, export it in your shell environment (e.g. `~/.zshrc`):

```bash
export PLAYWRIGHT_MCP_EXTENSION_TOKEN="<your-token-here>"
```

### Connection Method B: Chrome 144+ Auto-Discovery (Fallback)

No extensions needed. Just enable Chrome's built-in remote debugging:

1. Open `chrome://inspect#remote-debugging` in Chrome
2. Check **"Allow remote debugging for this browser instance"**
3. Set `OPENCLI_USE_CDP=1` before running opencli

*You can also manually specify an endpoint via `OPENCLI_CDP_ENDPOINT` env var.*

## Quick Start

### Install via npm (recommended)

```bash
npm install -g @jackwener/opencli
```

Then use directly:

```bash
opencli list                              # See all commands
opencli list -f yaml                      # List commands as YAML
opencli hackernews top --limit 5          # Public API, no browser
opencli bilibili hot --limit 5            # Browser command
opencli coupang search --query "milk"     # Logged-in browser search on Coupang
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

| Site | Commands | Mode |
|------|----------|------|
| **bilibili** | `dynamic` `favorite` `feed` `following` `history` `hot` `me` `ranking` `search` `subtitle` `user-videos` | 🔐 Browser |
| **zhihu** | `hot` `search` `question` | 🔐 Browser |
| **xiaohongshu** | `feed` `notifications` `search` `user` | 🔐 Browser |
| **xueqiu** | `feed` `hot-stock` `hot` `search` `stock` `watchlist` | 🔐 Browser |
| **twitter** | `trending` `bookmarks` `profile` `search` `timeline` `following` `followers` `notifications` `post` `reply` `delete` `like` | 🔐 Browser |
| **reddit** | `hot` `frontpage` `search` `subreddit` | 🔐 Browser |
| **weibo** | `hot` | 🔐 Browser |
| **boss** | `search` | 🔐 Browser |
| **coupang** | `search` `add-to-cart` | 🔐 Browser |
| **youtube** | `search` | 🔐 Browser |
| **yahoo-finance** | `quote` | 🔐 Browser |
| **reuters** | `search` | 🔐 Browser |
| **smzdm** | `search` | 🔐 Browser |
| **ctrip** | `search` | 🔐 Browser |
| **v2ex** | `daily` `hot` `latest` `me` `notifications` `topic` | 🌐 Public |
| **hackernews** | `top` | 🌐 Public |
| **bbc** | `news` | 🌐 Public |

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

## Troubleshooting

- **"Failed to connect to Playwright MCP Bridge"**
  - Ensure the Playwright MCP extension is installed and **enabled** in your running Chrome.
  - Restart the Chrome browser if you just installed the extension.
- **"CDP command failed" or "boss search blocked"**
  - Some sites (like BOSS Zhipin) actively block Chrome DevTools Protocol connections. OpenCLI falls back to cookie extraction, but ensure you didn't force `--chrome-mode` unnecessarily. 
- **Empty data returns or 'Unauthorized' error**
  - Your login session in Chrome might have expired. Open a normal Chrome tab, navigate to the target site, and log in or refresh the page to prove you are human.
- **Node API errors**
  - Make sure you are using Node.js >= 18. Some dependencies require modern Node APIs.

## Releasing New Versions

```bash
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
git push --follow-tags
```

The CI will automatically build, create a GitHub release, and publish to npm.

## License

[BSD-3-Clause](./LICENSE)
