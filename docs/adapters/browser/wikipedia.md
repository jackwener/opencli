# Wikipedia

**Mode**: 🌐 Public · **Domain**: `wikipedia.org`

## Commands

| Command | Description |
|---------|-------------|
| `opencli wikipedia search` | Search Wikipedia articles |
| `opencli wikipedia summary` | Get Wikipedia article summary |
| `opencli wikipedia random` | Get a random Wikipedia article |
| `opencli wikipedia trending` | Most-read articles (yesterday) |

## Usage Examples

```bash
# Search articles
opencli wikipedia search "quantum computing" --limit 10

# Get article summary
opencli wikipedia summary "Artificial intelligence"

# Get a random article
opencli wikipedia random

# Most-read articles (yesterday)
opencli wikipedia trending --limit 5

# Use with other languages
opencli wikipedia search "人工智能" --lang zh
opencli wikipedia random --lang ja

# JSON output
opencli wikipedia search "Rust" -f json
```

## Prerequisites

- No browser required — uses public Wikipedia API
