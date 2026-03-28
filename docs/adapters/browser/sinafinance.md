# 新浪财经 (Sina Finance)

**Mode**: 🌐 Public / 🔐 Browser · **Domain**: `finance.sina.com.cn`

## Commands

| Command | Description | Mode |
|---------|-------------|------|
| `opencli sinafinance news` | 新浪财经 7×24 小时实时快讯 | 🌐 Public |
| `opencli sinafinance rolling-news` | 新浪财经滚动新闻 | 🔐 Browser |
| `opencli sinafinance stock` | 新浪财经行情（A股/港股/美股） | 🔐 Browser |

## Usage Examples

### news - 7×24 实时快讯

```bash
# Latest financial news
opencli sinafinance news --limit 20

# Filter by type
opencli sinafinance news --type 1   # A股
opencli sinafinance news --type 2   # 宏观
opencli sinafinance news --type 6   # 国际

# JSON output
opencli sinafinance news -f json
```

### rolling-news - 滚动新闻

```bash
# Rolling news feed
opencli sinafinance rolling-news

# JSON output
opencli sinafinance rolling-news -f json
```

### stock - 股票行情

```bash
# Search and view A-share stock
opencli sinafinance stock 贵州茅台 --market cn

# Search and view HK stock
opencli sinafinance stock 腾讯控股 --market hk

# Search and view US stock
opencli sinafinance stock aapl --market us

# Auto-detect market (searches cn, hk, us in order)
opencli sinafinance stock 招商证券

# JSON output
opencli sinafinance stock 贵州茅台 -f json
```

## Options

### news

| Option | Description |
|--------|-------------|
| `--limit` | Max results, up to 50 (default: 20) |
| `--type` | News type: `0`=全部, `1`=A股, `2`=宏观, `3`=公司, `4`=数据, `5`=市场, `6`=国际, `7`=观点, `8`=央行, `9`=其它 |

### stock

| Option | Description |
|--------|-------------|
| `--key` | Stock name or code to search (required) |
| `--market` | Market: `cn`, `hk`, `us`, `auto` (default: auto). When `auto`, searches in cn, hk, us order |

## Prerequisites

- `news`: No browser required — uses public API
- `rolling-news` & `stock`: Chrome running and **logged into** `finance.sina.com.cn`
- For `rolling-news` & `stock`: [Browser Bridge extension](/guide/browser-bridge) installed

## Notes

- `news` command uses a public API and does not require browser or login
- `stock` command supports Chinese stock names and codes, and automatically detects the market
- Market priority for auto-detection: cn (A股) → hk (港股) → us (美股)
