# 新浪财经 (Sina Finance)

**Mode**: 🌐 Public · **Domain**: `finance.sina.com.cn`

## Commands

| Command | Description |
|---------|-------------|
| `opencli sinafinance news` | 新浪财经 7×24 小时实时快讯 |

## Usage Examples

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

### Options

| Option | Description |
|--------|-------------|
| `--limit` | Max results, up to 50 (default: 20) |
| `--type` | News type: `0`=全部, `1`=A股, `2`=宏观, `3`=公司, `4`=数据, `5`=市场, `6`=国际, `7`=观点, `8`=央行, `9`=其它 |

## Prerequisites

- No browser required — uses public API
