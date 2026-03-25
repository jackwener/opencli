# devto

Auto-generated from `src/clis/devto` source files.

Total commands: **3**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### tag
- Description: Latest DEV.to articles for a specific tag
- Risk: low
- Source: `src/clis/devto/tag.yaml`
- Args:
  - `tag` (required) — type=str; "Tag name (e.g. javascript, python, webdev)"
  - `limit` (optional) — type=int; default=20; Number of articles
- Example: `opencli devto tag -f json`

### top
- Description: Top DEV.to articles of the day
- Risk: low
- Source: `src/clis/devto/top.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of articles
- Example: `opencli devto top -f json`

### user
- Description: Recent DEV.to articles from a specific user
- Risk: low
- Source: `src/clis/devto/user.yaml`
- Args:
  - `username` (required) — type=str; "DEV.to username (e.g. ben, thepracticaldev)"
  - `limit` (optional) — type=int; default=20; Number of articles
- Example: `opencli devto user -f json`
