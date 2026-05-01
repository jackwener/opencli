# WeChat (微信公众号)

**Mode**: 🔐 Browser · **Domain**: `mp.weixin.qq.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli weixin download` | 下载微信公众号文章为 Markdown 格式 |
| `opencli weixin drafts` | 列出公众号后台草稿箱中的图文草稿 |
| `opencli weixin create-draft` | 在公众号后台创建新的图文草稿 |

## Usage Examples

```bash
# Export article to Markdown
opencli weixin download --url "https://mp.weixin.qq.com/s/xxx" --output ./weixin

# Export with locally downloaded images
opencli weixin download --url "https://mp.weixin.qq.com/s/xxx" --download-images

# Export without images
opencli weixin download --url "https://mp.weixin.qq.com/s/xxx" --no-download-images

# List the latest drafts
opencli weixin drafts --limit 5

# Create a draft article
opencli weixin create-draft --title "周报" --author "OpenCLI" --summary "本周更新摘要" "这里是正文内容"

# Create a draft with a cover image sourced from local disk
opencli weixin create-draft --title "封面示例" --cover-image ./cover.png "正文会先插入图片，再设为封面"
```

## Output

Downloads to `<output>/<article-title>/`:
- `<article-title>.md` — Markdown with frontmatter (title, author, publish time, source URL)
- `images/` — Downloaded images (if `--download-images` is enabled, default: true)

## Prerequisites

- Chrome running and **logged into** mp.weixin.qq.com (for articles behind login wall)
- [Browser Bridge extension](/guide/browser-bridge) installed
- `create-draft` with `--cover-image` requires Browser Bridge file upload support
