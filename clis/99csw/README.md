# 99csw — 九九藏书网 Adapter

[English](#english) | [中文](#中文)

---

## English

OpenCLI adapter for [99csw.com](https://www.99csw.com) (九九藏书网) — a Chinese online e-book library.

### Strategy

- **Auth**: `COOKIE` (browser required; Cloudflare challenge must be solved by the real browser)
- **Browser**: `true`

Run `opencli browser login https://www.99csw.com` once if Cloudflare blocks anonymous access.

### Commands

#### `list-chapters` — List all chapters of a book

```bash
opencli 99csw list-chapters <book_id>
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `book_id` | string | ✅ | Book ID from URL (e.g. `9210` in `/book/9210/index.htm`) |

Columns: `rank`, `chapter_id`, `title`

Example:

```bash
opencli 99csw list-chapters 9210
```

#### `content` — Fetch a single chapter's full content

```bash
opencli 99csw content <book_id> <chapter_id>
```

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `book_id` | string | ✅ | Book ID |
| `chapter_id` | string | ✅ | Chapter ID (from `list-chapters`) |

Columns: `title`, `content`

Example:

```bash
opencli 99csw content 9210 328790
```

#### `full` — Download the whole book (resume-capable, serial queue)

```bash
opencli 99csw full <book_id> [--limit N] [--skip N] [--output PATH] [--lock_timeout SEC] [--no_lock]
```

| Arg | Type | Default | Description |
|-----|------|---------|-------------|
| `book_id` | string | — | Book ID |
| `--limit` | int | `50` | Maximum number of chapters to download |
| `--skip` | int | `0` | Number of chapters to skip from the start |
| `--output` | string | `""` | If set, saves the full book text to this path (supports `~`). Enables **resume**. |
| `--lock_timeout` | int | `3600` | Max seconds to wait for another 99csw download to finish |
| `--no_lock` | bool | `false` | Skip the queue lock (expert; parallel runs may collide) |

Columns (summary): `chapter_num`, `title`, `content_preview`, `status`

**Resume**: when `--output` is set, a sidecar checkpoint `<output>.ckpt` is written after each chapter. Re-running the same command appends only the missing chapters. The sidecar is removed on successful completion.

**Serial queue**: only one `99csw full` can run at a time (lock at `~/.opencli/locks/99csw.lock`). Launch as many parallel agents as you want — they'll queue automatically instead of fighting over the shared browser tab.

Example — download the complete book to Desktop:

```bash
opencli 99csw full 9210 --output ~/Desktop/book.txt
```

> For long books, increase the browser timeout:
> `OPENCLI_BROWSER_COMMAND_TIMEOUT=900 opencli 99csw full 9210 --output ~/Desktop/book.txt`

### How to find a book ID

From any book page URL: `https://www.99csw.com/book/{book_id}/index.htm`

---

## 中文

[99csw.com](https://www.99csw.com)（九九藏书网）的 OpenCLI 适配器 —— 中文在线电子书阅读平台。

### 认证策略

- **策略**：`COOKIE`（必须使用浏览器；Cloudflare 人机校验需真实浏览器处理）
- **浏览器**：`true`

若 Cloudflare 拦截匿名访问，先执行一次 `opencli browser login https://www.99csw.com`。

### 命令

#### `list-chapters` —— 列出某本书的所有章节

```bash
opencli 99csw list-chapters <book_id>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 书籍 ID（从 URL 中提取，如 `/book/9210/index.htm` 中的 `9210`） |

输出列：`rank`（序号）、`chapter_id`（章节 ID）、`title`（章节标题）

示例：

```bash
opencli 99csw list-chapters 9210
```

#### `content` —— 获取单个章节的完整内容

```bash
opencli 99csw content <book_id> <chapter_id>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 书籍 ID |
| `chapter_id` | string | ✅ | 章节 ID（从 `list-chapters` 获取） |

输出列：`title`（章节标题）、`content`（章节正文）

示例：

```bash
opencli 99csw content 9210 328790
```

#### `full` —— 下载整本书（支持断点续传、自动串行排队）

```bash
opencli 99csw full <book_id> [--limit N] [--skip N] [--output PATH] [--lock_timeout SEC] [--no_lock]
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `book_id` | string | — | 书籍 ID |
| `--limit` | int | `50` | 最多下载的章节数 |
| `--skip` | int | `0` | 跳过开头的章节数 |
| `--output` | string | `""` | 若设置则写入该路径（支持 `~`），并启用**断点续传** |
| `--lock_timeout` | int | `3600` | 等待其他 99csw 下载结束的最长秒数 |
| `--no_lock` | bool | `false` | 跳过串行锁（专业用户使用；并发运行可能冲突） |

输出列（摘要）：`chapter_num`（章节号）、`title`（标题）、`content_preview`（预览）、`status`（状态）

**断点续传**：当指定 `--output` 时，每下完一章都会更新 sidecar 文件 `<output>.ckpt`。再次用同样的命令运行时，只会补下缺失的章节，整书下完后 sidecar 自动删除。

**串行排队**：同时刻只允许一个 `99csw full` 运行（锁文件 `~/.opencli/locks/99csw.lock`）。启动多个 agent 并行下载时它们会自动排队，不再抢占浏览器 tab 导致内容串台。

示例 —— 下载整本书到桌面：

```bash
opencli 99csw full 9210 --output ~/Desktop/book.txt
```

> 章节数较多时，可调大浏览器超时：
> `OPENCLI_BROWSER_COMMAND_TIMEOUT=900 opencli 99csw full 9210 --output ~/Desktop/book.txt`

### 如何获取书籍 ID

访问任一书籍页，URL 格式为 `https://www.99csw.com/book/{book_id}/index.htm`。
