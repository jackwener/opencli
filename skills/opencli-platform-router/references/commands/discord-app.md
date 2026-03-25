# discord-app

Auto-generated from `src/clis/discord-app` source files.

Total commands: **7**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### channels
- Description: List channels in the current Discord server
- Risk: low
- Source: `src/clis/discord-app/channels.ts`
- Args: none declared
- Example: `opencli discord-app channels -f json`

### members
- Description: List online members in the current Discord channel
- Risk: low
- Source: `src/clis/discord-app/members.ts`
- Args: none declared
- Example: `opencli discord-app members -f json`

### read
- Description: Read recent messages from the active Discord channel
- Risk: low
- Source: `src/clis/discord-app/read.ts`
- Args:
  - `count` (optional) — default=20)'; Number of messages to read (default: 20)
- Example: `opencli discord-app read -f json`

### search
- Description: Search messages in the current Discord server/channel (Cmd+F)
- Risk: low
- Source: `src/clis/discord-app/search.ts`
- Args:
  - `query` (required) — Search query
- Example: `opencli discord-app search -f json`

### send
- Description: Send a message in the active Discord channel
- Risk: low
- Source: `src/clis/discord-app/send.ts`
- Args:
  - `text` (required) — Message to send
- Example: `opencli discord-app send -f json`

### servers
- Description: List all Discord servers (guilds) in the sidebar
- Risk: low
- Source: `src/clis/discord-app/servers.ts`
- Args: none declared
- Example: `opencli discord-app servers -f json`

### status
- Description: Check active CDP connection to Discord Desktop
- Risk: low
- Source: `src/clis/discord-app/status.ts`
- Args: none declared
- Example: `opencli discord-app status -f json`
