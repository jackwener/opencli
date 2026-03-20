# arXiv

**Mode**: 🌐 Public · **Domain**: `arxiv.org`

## Commands

| Command | Description |
|---------|-------------|
| `opencli arxiv search` | Search arXiv papers |
| `opencli arxiv paper` | Get arXiv paper details by ID |

## Usage Examples

```bash
# Search for papers
opencli arxiv search "transformer attention" --limit 10

# Get paper details by arXiv ID
opencli arxiv paper 2301.00001

# JSON output
opencli arxiv search "LLM" -f json
```

## Prerequisites

- No browser required — uses public arXiv API
