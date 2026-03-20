# Stack Overflow

**Mode**: 🌐 Public · **Domain**: `stackoverflow.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli stackoverflow hot` | Hot questions |
| `opencli stackoverflow search` | Search questions |
| `opencli stackoverflow bounties` | Questions with active bounties |
| `opencli stackoverflow unanswered` | Unanswered questions |

## Usage Examples

```bash
# Hot questions
opencli stackoverflow hot --limit 10

# Search questions
opencli stackoverflow search "async await" --limit 20

# Active bounties
opencli stackoverflow bounties --limit 10

# Unanswered questions
opencli stackoverflow unanswered --limit 10

# JSON output
opencli stackoverflow hot -f json
```

## Prerequisites

- No browser required — uses public Stack Exchange API
