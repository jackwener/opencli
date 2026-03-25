# cursor

Auto-generated from `src/clis/cursor` source files.

Total commands: **10**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Send a prompt and wait for the AI response (send + wait + read)
- Risk: low
- Source: `src/clis/cursor/ask.ts`
- Args:
  - `text` (required) — Prompt to send
  - `timeout` (optional) — default=30)'; Max seconds to wait for response (default: 30)
- Example: `opencli cursor ask -f json`

### composer
- Description: Send a prompt directly into Cursor Composer (Cmd+I shortcut)
- Risk: low
- Source: `src/clis/cursor/composer.ts`
- Args:
  - `text` (required) — Text to send into Composer
- Example: `opencli cursor composer -f json`

### dump
- Description: Dump the DOM and Accessibility tree of Cursor for reverse-engineering
- Risk: low
- Source: `src/clis/cursor/dump.ts`
- Args: none declared
- Example: `opencli cursor dump -f json`

### extract-code
- Description: Extract multi-line code blocks from the current Cursor conversation
- Risk: low
- Source: `src/clis/cursor/extract-code.ts`
- Args: none declared
- Example: `opencli cursor extract-code -f json`

### history
- Description: List recent chat sessions from the Cursor sidebar
- Risk: low
- Source: `src/clis/cursor/history.ts`
- Args: none declared
- Example: `opencli cursor history -f json`

### model
- Description: Get or switch the currently active AI model in Cursor
- Risk: low
- Source: `src/clis/cursor/model.ts`
- Args:
  - `model-name` (optional) — The ID of the model to switch to (e.g. claude-3.5-sonnet)
- Example: `opencli cursor model -f json`

### new
- Description: Start a new Cursor chat or Composer session
- Risk: low
- Source: `src/clis/cursor/new.ts`
- Args: none declared
- Example: `opencli cursor new -f json`

### read
- Description: Read the current Cursor chat/composer conversation history
- Risk: low
- Source: `src/clis/cursor/read.ts`
- Args: none declared
- Example: `opencli cursor read -f json`

### send
- Description: Send a prompt directly into Cursor Composer/Chat
- Risk: low
- Source: `src/clis/cursor/send.ts`
- Args:
  - `text` (required) — Text to send into Cursor
- Example: `opencli cursor send -f json`

### status
- Description: Check active CDP connection to Cursor AI Editor
- Risk: low
- Source: `src/clis/cursor/status.ts`
- Args: none declared
- Example: `opencli cursor status -f json`
