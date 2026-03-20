# Grok

**Mode**: 🔐 Browser · **Domain**: `grok.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli grok ask` | Send a message to Grok and get response |

## Usage Examples

```bash
# Ask Grok a question
opencli grok ask --prompt "Explain quantum computing in simple terms"

# Start a new chat session
opencli grok ask --prompt "Hello" --new

# Set custom timeout (default: 120s)
opencli grok ask --prompt "Write a long essay" --timeout 180
```

### Options

| Option | Description |
|--------|-------------|
| `--prompt` | The message to send (required) |
| `--timeout` | Wait timeout in seconds (default: 120) |
| `--new` | Start a new chat session (default: false) |

## Prerequisites

- Chrome running and **logged into** grok.com
- [Browser Bridge extension](/guide/browser-bridge) installed
