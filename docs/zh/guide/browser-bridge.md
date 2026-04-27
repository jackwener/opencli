# Browser Bridge 设置

> **⚠️ 重要**: 浏览器命令复用你的 Chrome 登录会话。运行命令前必须在 Chrome 中登录目标网站。

OpenCLI 通过轻量级 **Browser Bridge** Chrome 扩展 + 微守护进程连接浏览器（零配置，自动启动）。

## 扩展安装

### 方法 1：下载预构建版本（推荐）

1. 前往 GitHub [Releases 页面](https://github.com/jackwener/opencli/releases) 下载最新的 `opencli-extension-v{version}.zip`。
2. 解压后打开 `chrome://extensions`，启用**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择解压后的文件夹。

### 方法 2：加载源码（开发者）

1. 打开 `chrome://extensions`，启用**开发者模式**。
2. 点击**加载已解压的扩展程序**，选择仓库中的 `extension/` 目录。

## 验证

```bash
opencli doctor            # 检查扩展 + 守护进程连接
```

## 多 Tab 定位

浏览器命令默认运行在共享的 `browser:default` workspace 中；如果需要操作指定 tab，可以显式传目标 target。

```bash
opencli browser open https://www.baidu.com/
opencli browser tab list
opencli browser tab new https://www.baidu.com/
opencli browser eval --tab <targetId> 'document.title'
opencli browser tab select <targetId>
opencli browser get title
opencli browser tab close <targetId>
```

规则如下：

- `opencli browser open <url>` 和 `opencli browser tab new [url]` 都会返回 `targetId`。
- `opencli browser tab list` 会打印当前已存在 tab 的 `targetId`。
- `--tab <targetId>` 会把单条 browser 命令路由到对应 tab。
- `tab new` 只会新建 tab，不会改变默认浏览器目标。
- `tab select <targetId>` 会把该 tab 设为后续未显式指定 target 的 `opencli browser ...` 命令默认目标。
- `tab close <targetId>` 会关闭该 tab；如果它正好是当前默认目标，会一并清掉这条默认绑定。

## 多 Chrome Profile

如果你在多个 Chrome profile（例如 `Work` 和 `Personal`）里都装了 Browser Bridge 扩展，它们会同时连到同一个 daemon。命令按 profile 路由，每条 CLI 调用都会命中你指定的那个浏览器，而不是静默落到最后连上来的那个。

### 给 profile 命名

每个扩展首次启动会生成唯一的 `profileId`。popup 默认显示 `Profile-<短 hash>`，点 chip 上的铅笔图标可以改成 `work`、`home` 这样的短名。CLI 里引用的就是这个 label。

### 选择命令跑在哪个 profile

优先级（从高到低）：

1. 单条命令上的 `--profile <name>` 参数
2. `OPENCLI_PROFILE` 环境变量（shell 级）
3. `opencli profile use <name>` 持久化默认（`~/.opencli/config.json`）
4. 仅一个 profile 在线时的自动路由（向后兼容）

```bash
opencli profile list                     # 查看已连接的 profile
opencli profile use work                 # 持久化默认
opencli profile current                  # 查看当前默认来源
opencli --profile personal reddit saved  # 单条命令覆盖
```

### 多个 session 同时操作不同 profile

用 `OPENCLI_PROFILE`（进程级环境变量）——两个 terminal / Claude Code session / Codex session 各自指向不同 profile，不会互相覆盖共享默认。

```bash
# Terminal 1
export OPENCLI_PROFILE=work
opencli reddit saved

# Terminal 2 —— 并发独立
export OPENCLI_PROFILE=personal
opencli reddit saved
```

两条命令分别进入各自 Chrome profile 的自动化窗口，cookie、会话状态、登录信息完全隔离。

## Daemon 生命周期

Daemon 在首次运行浏览器命令时自动启动，之后保持常驻运行。

```bash
opencli daemon stop      # 优雅关停
```

Daemon 为常驻模式，会一直运行直到你显式停止（`opencli daemon stop`）或卸载包。
