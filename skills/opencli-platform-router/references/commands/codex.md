# codex

Auto-generated from `src/clis/codex` source files.

Total commands: **11**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Send a prompt and wait for the AI response (send + wait + read)
- Risk: low
- Source: `src/clis/codex/ask.ts`
- Args:
  - `text` (required) — Prompt to send
  - `timeout` (optional) — default=60)'; Max seconds to wait for response (default: 60)
- Example: `opencli codex ask -f json`

### dump
- Description: Dump the DOM and Accessibility tree of Codex for reverse-engineering
- Risk: low
- Source: `src/clis/codex/dump.ts`
- Args: none declared
- Example: `opencli codex dump -f json`

### export
- Description: Export the current Codex conversation to a Markdown file
- Risk: low
- Source: `src/clis/codex/export.ts`
- Args:
  - `output` (optional) — default=/tmp/codex-export.md)'; Output file (default: /tmp/codex-export.md)
- Example: `opencli codex export -f json`

### extract-diff
- Description: Extract visual code review diff patches from Codex
- Risk: low
- Source: `src/clis/codex/extract-diff.ts`
- Args: none declared
- Example: `opencli codex extract-diff -f json`

### history
- Description: List recent conversation threads in Codex
- Risk: low
- Source: `src/clis/codex/history.ts`
- Args: none declared
- Example: `opencli codex history -f json`

### model
- Description: Get or switch the currently active AI model in Codex Desktop
- Risk: low
- Source: `src/clis/codex/model.ts`
- Args:
  - `model-name` (optional) — The ID of the model to switch to (e.g. gpt-4)
- Example: `opencli codex model -f json`

### new
- Description: Start a new Codex conversation thread / isolated workspace
- Risk: low
- Source: `src/clis/codex/new.ts`
- Args: none declared
- Example: `opencli codex new -f json`

### read
- Description: Read the contents of the current Codex conversation thread
- Risk: low
- Source: `src/clis/codex/read.ts`
- Args: none declared
- Example: `opencli codex read -f json`

### screenshot
- Description: Capture a snapshot of the current Codex window (DOM + Accessibility tree)
- Risk: low
- Source: `src/clis/codex/screenshot.ts`
- Args:
  - `output` (optional) — default=/tmp/codex-snapshot.txt)'; Output file path (default: /tmp/codex-snapshot.txt)
- Example: `opencli codex screenshot -f json`

### send
- Description: Send text/commands to the Codex AI composer
- Risk: low
- Source: `src/clis/codex/send.ts`
- Args:
  - `text` (required) — Text, command (e.g. /review), or skill (e.g. $imagegen)
- Example: `opencli codex send -f json`

### status
- Description: Check active CDP connection to OpenAI Codex App
- Risk: low
- Source: `src/clis/codex/status.ts`
- Args: none declared
- Example: `opencli codex status -f json`
