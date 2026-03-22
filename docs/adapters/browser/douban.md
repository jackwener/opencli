# 豆瓣 (Douban)

**Mode**: 🔐 Browser (Cookie) · **Domain**: `douban.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli douban movie-hot` | 豆瓣电影热门榜单 |
| `opencli douban book-hot` | 豆瓣图书热门榜单 |
| `opencli douban search` | 搜索豆瓣电影、图书或音乐 |

## Usage Examples

```bash
# 电影热门
opencli douban movie-hot --limit 10

# 图书热门
opencli douban book-hot --limit 10

# 搜索电影
opencli douban search "流浪地球"

# 搜索图书
opencli douban search --type book "三体"

# 搜索音乐
opencli douban search --type music "周杰伦"

# JSON output
opencli douban movie-hot -f json
```

## Prerequisites

- Chrome logged into `douban.com`
- Browser Bridge extension installed
