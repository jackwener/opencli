# Doubao App

Control the **Doubao AI desktop app** (豆包) directly from the terminal via Chrome DevTools Protocol (CDP).

## Prerequisites

1. Install the official Doubao desktop app.
2. Launch Doubao with the remote debugging port enabled:

```bash
# macOS
/Applications/Doubao.app/Contents/MacOS/Doubao \
  --remote-debugging-port=9226
```

3. Set the CDP endpoint:

```bash
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:9226"
```

## Commands

- `opencli doubao-app status`: Check if the Doubao app is running and accessible via CDP.
- `opencli doubao-app new`: Start a new conversation.
- `opencli doubao-app send "message"`: Send a message to the active conversation.
- `opencli doubao-app read`: Read chat messages from the current conversation.
- `opencli doubao-app ask "message"`: Send a prompt and wait for the assistant reply in one shot.
- `opencli doubao-app screenshot`: Capture a screenshot of the current Doubao window.
- `opencli doubao-app dump`: Dump the full conversation history from the current session.

## How It Works

Doubao Desktop is an Electron app. OpenCLI connects via the Chrome DevTools Protocol to the Electron renderer process and interacts with the chat UI using `data-testid` selectors exposed by the app.

## Limitations

- Requires Doubao to be launched with `--remote-debugging-port=9226`
- CDP endpoint must be reachable at the configured address
- `read` returns only the visible messages in the current conversation