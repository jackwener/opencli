# antigravity

Auto-generated from `src/clis/antigravity` source files.

Total commands: **8**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### dump
- Description: Dump the DOM to help AI understand the UI
- Risk: low
- Source: `src/clis/antigravity/dump.ts`
- Args: none declared
- Example: `opencli antigravity dump -f json`

### extract-code
- Description: Extract multi-line code blocks from the current Antigravity conversation
- Risk: low
- Source: `src/clis/antigravity/extract-code.ts`
- Args: none declared
- Example: `opencli antigravity extract-code -f json`

### model
- Description: Switch the active LLM model in Antigravity
- Risk: low
- Source: `src/clis/antigravity/model.ts`
- Args:
  - `name` (required) — Target model name (e.g. claude, gemini, o1)
- Example: `opencli antigravity model -f json`

### new
- Description: Start a new conversation / clear context in Antigravity
- Risk: low
- Source: `src/clis/antigravity/new.ts`
- Args: none declared
- Example: `opencli antigravity new -f json`

### read
- Description: Read the latest chat messages from Antigravity AI
- Risk: low
- Source: `src/clis/antigravity/read.ts`
- Args:
  - `last` (optional) — Number of recent messages to read (not fully implemented due to generic structure, currently returns full history text or latest chunk)
- Example: `opencli antigravity read -f json`

### send
- Description: Send a message to Antigravity AI via the internal Lexical editor
- Risk: low
- Source: `src/clis/antigravity/send.ts`
- Args:
  - `message` (required) — The message text to send
- Example: `opencli antigravity send -f json`

### status
- Description: Check Antigravity CDP connection and get current page state
- Risk: low
- Source: `src/clis/antigravity/status.ts`
- Args: none declared
- Example: `opencli antigravity status -f json`

### watch
- Description: Stream new chat messages from Antigravity in real-time
- Risk: low
- Source: `src/clis/antigravity/watch.ts`
- Args: none declared
- Example: `opencli antigravity watch -f json`
