---
name: opencli-usage
description: "Use when running OpenCLI commands to interact with websites (Bilibili, Twitter, Reddit, Xiaohongshu, etc.), desktop apps (Cursor, Notion), or public APIs (HackerNews, arXiv). Covers installation, command reference, and output formats for 60+ adapters."
version: 1.5.9
author: jackwener
tags: [opencli, cli, browser, web, chrome-extension, cdp, bilibili, twitter, reddit, xiaohongshu, github, youtube, AI, agent, automation]
---

# OpenCLI Usage Guide

> Make any website or Electron App your CLI. Reuse Chrome login, zero risk, AI-powered discovery.

## Install & Run

```bash
# npm global install (recommended)
npm install -g @jackwener/opencli
opencli <command>

# Or from source
cd ~/code/opencli && npm install
npx tsx src/main.ts <command>

# Update to latest
npm update -g @jackwener/opencli
```

## Prerequisites

Browser commands require:
1. Chrome browser running **(logged into target sites)**
2. **opencli Browser Bridge** Chrome extension installed (load `extension/` as unpacked in `chrome://extensions`)
3. No further setup needed — the daemon auto-starts on first browser command

> **Note**: You must be logged into the target website in Chrome before running commands. Tabs opened during command execution are auto-closed afterwards.

Public API commands (`hackernews`, `v2ex`) need no browser.

## Quick Lookup by Capability

| Capability | Platforms (partial list) | File |
|-----------|--------------------------|------|
| **search** | Bilibili, Twitter, Reddit, Xiaohongshu, Zhihu, YouTube, Google, arXiv, LinkedIn, Pixiv, etc. | browser.md / public-api.md |
| **hot/trending** | Bilibili, Twitter, Weibo, HackerNews, Reddit, V2EX, Xueqiu, Lobsters, Douban | browser.md / public-api.md |
| **feed/timeline** | Twitter, Reddit, Xiaohongshu, Xueqiu, Jike, Facebook, Instagram, Medium | browser.md |
| **user/profile** | Twitter, Reddit, Instagram, TikTok, Facebook, Bilibili, Pixiv | browser.md |
| **post/create** | Twitter, Jike | browser.md |
| **AI chat** | Grok, Doubao, Kimi, DeepSeek, Qwen, ChatGPT, Cursor, Codex | browser.md / desktop.md |
| **finance/stock** | Xueqiu, Yahoo Finance, Barchart, Sina Finance, Bloomberg | browser.md / public-api.md |
| **web scraping** | `opencli web read --url <url>` — any URL to Markdown | browser.md |

## Command Categories

### 📱 Browser-based Commands (login required)
See [browser.md](./browser.md) — 40+ platforms including Bilibili, Twitter, Reddit, Xiaohongshu, YouTube, Instagram, TikTok, Facebook, LinkedIn, etc.

### 🖥️ Desktop Adapter Commands
See [desktop.md](./desktop.md) — GitHub (gh CLI), Cursor, Codex, ChatGPT, ChatWise, Notion, Discord App, Doubao App, Antigravity.

### 🌐 Public API Commands (no browser needed)
See [public-api.md](./public-api.md) — HackerNews, V2EX, Google, arXiv, Bloomberg RSS, StackOverflow, Wikipedia, etc.

### 🔧 Management & AI Workflow
See [plugins.md](./plugins.md) — `opencli list`, `opencli validate`, `opencli explore`, `opencli record`, output formats, environment variables.

## Related Skills

- **opencli-explorer** — Full guide for creating new adapters (API discovery, auth strategy, YAML/TS writing)
- **opencli-oneshot** — Quick 4-step template for adding a single command from a URL
