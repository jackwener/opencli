# Web

**Mode**: 🔐 Browser · **Domain**: any URL

## Commands

| Command | Description |
|---------|-------------|
| `opencli web read <url>` | Fetch any web page and export as Markdown |

## Usage Examples

```bash
# Read a web page and save as Markdown
opencli web read https://example.com/article

# Custom output directory
opencli web read https://example.com/article --output ./my-articles

# Skip image download
opencli web read https://example.com/article --download-images false

# JSON output
opencli web read https://example.com/article -f json
```

## Prerequisites

- Chrome running
- [Browser Bridge extension](/guide/browser-bridge) installed
