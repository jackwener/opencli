# notion

Auto-generated from `src/clis/notion` source files.

Total commands: **8**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### export
- Description: Export the current Notion page as Markdown
- Risk: low
- Source: `src/clis/notion/export.ts`
- Args:
  - `output` (optional) — default=/tmp/notion-export.md)'; Output file (default: /tmp/notion-export.md)
- Example: `opencli notion export -f json`

### favorites
- Description: List pages from the Notion Favorites section in the sidebar
- Risk: low
- Source: `src/clis/notion/favorites.ts`
- Args: none declared
- Example: `opencli notion favorites -f json`

### new
- Description: Create a new page in Notion
- Risk: low
- Source: `src/clis/notion/new.ts`
- Args:
  - `title` (optional) — Page title (optional)
- Example: `opencli notion new -f json`

### read
- Description: Read the content of the currently open Notion page
- Risk: low
- Source: `src/clis/notion/read.ts`
- Args: none declared
- Example: `opencli notion read -f json`

### search
- Description: Search pages and databases in Notion via Quick Find (Cmd+P)
- Risk: low
- Source: `src/clis/notion/search.ts`
- Args:
  - `query` (required) — Search query
- Example: `opencli notion search -f json`

### sidebar
- Description: List pages and databases from the Notion sidebar
- Risk: low
- Source: `src/clis/notion/sidebar.ts`
- Args: none declared
- Example: `opencli notion sidebar -f json`

### status
- Description: Check active CDP connection to Notion Desktop
- Risk: low
- Source: `src/clis/notion/status.ts`
- Args: none declared
- Example: `opencli notion status -f json`

### write
- Description: Append text content to the currently open Notion page
- Risk: low
- Source: `src/clis/notion/write.ts`
- Args:
  - `text` (required) — Text to append to the page
- Example: `opencli notion write -f json`
