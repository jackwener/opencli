# GitHub Trending

**Mode**: 🔐 Browser · **Domain**: `github.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli github-trending repos` | Trending repositories |
| `opencli github-trending developers` | Trending developers |

## Usage Examples

```bash
# Daily trending repos
opencli github-trending repos --limit 10

# Weekly trending
opencli github-trending repos --since weekly

# Trending Python repos
opencli github-trending repos --language python

# Trending Rust repos this month
opencli github-trending repos --language rust --since monthly

# Trending developers
opencli github-trending developers --limit 10

# JSON output
opencli github-trending repos --limit 5 -f json
```

## Prerequisites

- Chrome running
- [Browser Bridge extension](/guide/browser-bridge) installed
