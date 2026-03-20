# LINUX DO

**Mode**: 🔐 Browser · **Domain**: `linux.do`

## Commands

| Command | Description |
|---------|-------------|
| `opencli linux-do hot` | 热门话题 |
| `opencli linux-do latest` | 最新话题 |
| `opencli linux-do categories` | 板块列表 |
| `opencli linux-do category` | 板块话题 |
| `opencli linux-do search` | 搜索话题 |
| `opencli linux-do topic` | 话题详情 |

## Usage Examples

```bash
# Hot topics this week
opencli linux-do hot --limit 20

# Hot topics by period
opencli linux-do hot --period daily
opencli linux-do hot --period monthly

# Latest topics
opencli linux-do latest --limit 10

# List all categories
opencli linux-do categories

# Search topics
opencli linux-do search "NixOS"

# View topic details
opencli linux-do topic 12345

# JSON output
opencli linux-do hot -f json
```

## Prerequisites

- Chrome running and **logged into** linux.do
- [Browser Bridge extension](/guide/browser-bridge) installed
