# Hugging Face

**Mode**: 🌐 Public · **Domain**: `huggingface.co`

## Commands

| Command | Description |
|---------|-------------|
| `opencli hf top` | Top upvoted Hugging Face papers |

## Usage Examples

```bash
# Today's top papers
opencli hf top --limit 10

# All papers (no limit)
opencli hf top --all

# Specific date
opencli hf top --date 2025-03-01

# Weekly/monthly top papers
opencli hf top --period weekly
opencli hf top --period monthly

# JSON output
opencli hf top -f json
```

### Options

| Option | Description |
|--------|-------------|
| `--limit` | Number of papers (default: 20) |
| `--all` | Return all papers, ignoring limit |
| `--date` | Date in `YYYY-MM-DD` format (defaults to most recent) |
| `--period` | Time period: `daily`, `weekly`, or `monthly` (default: daily) |

## Prerequisites

- No browser required — uses public Hugging Face API
