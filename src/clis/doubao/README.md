# Doubao (豆包) CLI Adapter

Control the Doubao AI desktop app via CLI using Chrome DevTools Protocol (CDP).

## Prerequisites

1. Launch Doubao with remote debugging port:

```bash
"/Applications/Doubao.app/Contents/MacOS/Doubao" --remote-debugging-port=9226
```

2. Set environment variable:

```bash
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:9226"
export OPENCLI_CDP_TARGET="doubao"
```

## Commands

| Command | Description |
|---------|-------------|
| `opencli doubao status` | Check CDP connection status |
| `opencli doubao send "message"` | Send a message to Doubao AI |
| `opencli doubao read` | Read current chat history |
| `opencli doubao new` | Start a new chat |
| `opencli doubao ask "question"` | Send message and wait for response |
| `opencli doubao screenshot` | Capture screenshot to /tmp/doubao-screenshot.png |
| `opencli doubao dump` | Dump DOM to /tmp/doubao-dom.html |

## Examples

```bash
# Check connection
opencli doubao status

# Send a message
opencli doubao send "What is the capital of France?"

# Ask and get response (waits up to 30s)
opencli doubao ask "What is 2+2?"

# Read conversation
opencli doubao read

# New conversation
opencli doubao new
```

## Notes

- Doubao must be running with `--remote-debugging-port=9226`
- The app URL scheme is `doubao://doubao-chat/chat`
- If multiple targets exist, set `OPENCLI_CDP_TARGET=doubao` to select the correct one