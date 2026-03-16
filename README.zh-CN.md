# OpenCLI

> **把任何网站变成你的命令行工具。**  
> 零风控 · 复用 Chrome 登录 · AI 自动发现接口

[English](./README.md)

[![npm](https://img.shields.io/npm/v/@jackwener/opencli?style=flat-square)](https://www.npmjs.com/package/@jackwener/opencli)
[![Node.js Version](https://img.shields.io/node/v/@jackwener/opencli?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/@jackwener/opencli?style=flat-square)](./LICENSE)

OpenCLI 通过 Chrome 浏览器 + [Playwright MCP Bridge](https://github.com/nichochar/playwright-mcp) 扩展，将任何网站变成命令行工具。57个内置命令。不存密码、不泄 token，直接复用浏览器已登录状态。

---

## 目录

- [亮点](#亮点)
- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [内置命令](#内置命令)
- [输出格式](#输出格式)
- [致 AI Agent（开发者指南）](#致-ai-agent开发者指南)
- [常见问题排查](#常见问题排查)
- [版本发布](#版本发布)
- [License](#license)

---

## 亮点

- **57 个命令，17 个站点** — B站、知乎、小红书、Twitter、Reddit、雪球(xueqiu)、GitHub、V2EX、Hacker News、BBC、微博、BOSS直聘、Yahoo Finance、路透社、什么值得买、携程、YouTube
- **零风控** — 复用 Chrome 登录态，无需存储任何凭证
- **AI 原生** — `explore` 自动发现 API，`synthesize` 生成适配器，`cascade` 探测认证策略
- **动态加载引擎** — 声明式的 `.yaml` 或者底层定制的 `.ts` 适配器，放入 `clis/` 文件夹即可自动注册生效

## 前置要求

- **Node.js**: >= 18.0.0
- **Chrome** 浏览器正在运行，且**已登录目标网站**（如 bilibili.com、zhihu.com、xiaohongshu.com）

> **⚠️ 重要**：大多数命令复用你的 Chrome 登录状态。运行命令前，你必须已在 Chrome 中打开目标网站并完成登录。如果获取到空数据或报错，请先检查你的浏览器登录状态。

为了让 OpenCLI 能够联通你的浏览器，你需要配置连接方式。**强烈建议以下两种方式都配置上**，互为后备：

### 连接方式 A：Playwright MCP Bridge 扩展（首选）

1. 安装 **[Playwright MCP Bridge](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm)** 扩展
2. 在浏览器插件栏点击该插件，或者在插件设置页获取你的 Extension Token。

**你必须将这个 Token 同时配置到你的 MCP 配置文件 AND 环境变量中。**

首先，配置你的 MCP 客户端（如 Claude/Cursor 等）：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--extension"],
      "env": {
        "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "<你的-token>"
      }
    }
  }
}
```

并且，为了让 `opencli` 命令行也能直接使用它，你必须在你的终端系统环境变量中导出它（建议写进 `~/.zshrc` 或 `~/.bashrc`）：

```bash
export PLAYWRIGHT_MCP_EXTENSION_TOKEN="<你的-token>"
```

### 连接方式 B：Chrome 144+ CDP 自动发现（备选）

无需安装任何扩展。只需开启 Chrome 内置的远程调试：

1. 在 Chrome 中打开 `chrome://inspect#remote-debugging`
2. 勾选 **"允许对此浏览器实例进行远程调试" (Allow remote debugging for this browser instance)**
3. 运行时设置环境变量 `OPENCLI_USE_CDP=1`

*也可通过 `OPENCLI_CDP_ENDPOINT` 环境变量手动指定 CDP endpoint 地址。*

## 快速开始

### npm 全局安装（推荐）

```bash
npm install -g @jackwener/opencli
```

直接使用：

```bash
opencli list                              # 查看所有命令
opencli list -f yaml                      # 以 YAML 列出所有命令
opencli hackernews top --limit 5          # 公共 API，无需浏览器
opencli bilibili hot --limit 5            # 浏览器命令
opencli zhihu hot -f json                 # JSON 输出
opencli zhihu hot -f yaml                 # YAML 输出
```

### 从源码安装（面向开发者）

```bash
git clone git@github.com:jackwener/opencli.git
cd opencli 
npm install
npm run build
npm link      # 链接到全局环境
opencli list  # 可以在任何地方使用了！
```

### 更新

```bash
npm install -g @jackwener/opencli@latest
```

## 内置命令

| 站点 | 命令 | 模式 |
|------|------|------|
| **bilibili** | `hot` `search` `me` `favorite` ...（共11个） | 🔐 浏览器 |
| **zhihu** | `hot` `search` `question` | 🔐 浏览器 |
| **xiaohongshu** | `search` `notifications` `feed` `me` `user` | 🔐 浏览器 |
| **xueqiu** | `feed` `hot-stock` `hot` `search` `stock` `watchlist` | 🔐 浏览器 |
| **twitter** | `trending` `bookmarks` `profile` `search` `timeline` `following` `followers` `notifications` `post` `reply` `delete` `like` | 🔐 浏览器 |
| **reddit** | `hot` `frontpage` `search` `subreddit` | 🔐 浏览器 |
| **weibo** | `hot` | 🔐 浏览器 |
| **boss** | `search` | 🔐 浏览器 |
| **youtube** | `search` | 🔐 浏览器 |
| **yahoo-finance** | `quote` | 🔐 浏览器 |
| **reuters** | `search` | 🔐 浏览器 |
| **smzdm** | `search` | 🔐 浏览器 |
| **ctrip** | `search` | 🔐 浏览器 |
| **github** | `search` | 🌐 公共 API |
| **v2ex** | `hot` `latest` `topic` | 🌐 公共 API |
| **hackernews** | `top` | 🌐 公共 API |
| **bbc** | `news` | 🌐 公共 API |

## 输出格式

所有内置命令都支持 `--format` / `-f`，可选值为 `table`、`json`、`yaml`、`md`、`csv`。
`list` 命令也支持同样的格式参数，同时继续兼容 `--json`。

```bash
opencli list -f yaml            # 用 YAML 列出命令注册表
opencli bilibili hot -f table   # 默认：富文本表格
opencli bilibili hot -f json    # JSON（适合传给 jq 或者各类 AI Agent）
opencli bilibili hot -f yaml    # YAML（更适合人类直接阅读）
opencli bilibili hot -f md      # Markdown
opencli bilibili hot -f csv     # CSV
opencli bilibili hot -v         # 详细模式：展示管线执行步骤调试信息
```

## 致 AI Agent（开发者指南）

如果你是一个被要求查阅代码并编写新 `opencli` 适配器的 AI，请遵守以下工作流。

> **快速模式**：只想为某个页面快速生成一个命令？看 [CLI-ONESHOT.md](./CLI-ONESHOT.md) — 给一个 URL + 一句话描述，4 步搞定。

> **完整模式**：在编写任何新代码前，先阅读 [CLI-EXPLORER.md](./CLI-EXPLORER.md)。它包含完整的适配器探索开发指南、API 探测流程、5级认证策略以及常见陷阱。

```bash
# 1. Deep Explore — 网络拦截 → 响应分析 → 能力推理 → 框架检测
opencli explore https://example.com --site mysite

# 2. Synthesize — 从探索成果物生成 evaluate-based YAML 适配器
opencli synthesize mysite

# 3. Generate — 一键完成：探索 → 合成 → 注册
opencli generate https://example.com --goal "hot"

# 4. Strategy Cascade — 自动降级探测：PUBLIC → COOKIE → HEADER
opencli cascade https://api.example.com/data
```

探索结果输出到 `.opencli/explore/<site>/`。

## 常见问题排查

- **"Failed to connect to Playwright MCP Bridge"** 报错
  - 确保你当前的 Chrome 已安装且**开启了** Playwright MCP Bridge 浏览器插件。
  - 如果是刚装完插件，需要重启 Chrome 浏览器。
- **"CDP command failed" / "被风控拦截"**
  - 有些网站（例如 BOSS 直聘）会因为开了 DevTools 或者 CDP 端口拦截验证。OpenCLI 有 cookie 降级机制，通常不需要干预，不用去强行加上 CDP 标识参数即可。
- **返回空数据，或者报错 "Unauthorized"**
  - Chrome 里的登录态可能已经过期（甚至被要求过滑动验证码）。请打开当前 Chrome 页面，在新标签页重新手工登录或刷新该页面。
- **Node API 错误 (如 parseArgs, fs 等)**
  - 确保 Node.js 版本 `>= 18`。旧版不支持我们使用的现代核心库 API。

## 版本发布

```bash
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0

# 推送 tag，GitHub Actions 将自动执行发版和 npm 发布
git push --follow-tags
```

## License

[BSD-3-Clause](./LICENSE)
