# lobsters

Auto-generated from `src/clis/lobsters` source files.

Total commands: **4**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### active
- Description: Lobste.rs most active discussions
- Risk: low
- Source: `src/clis/lobsters/active.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli lobsters active -f json`

### hot
- Description: Lobste.rs hottest stories
- Risk: low
- Source: `src/clis/lobsters/hot.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli lobsters hot -f json`

### newest
- Description: Lobste.rs newest stories
- Risk: low
- Source: `src/clis/lobsters/newest.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli lobsters newest -f json`

### tag
- Description: Lobste.rs stories by tag
- Risk: low
- Source: `src/clis/lobsters/tag.yaml`
- Args:
  - `tag` (required) — type=str; "Tag name (e.g. programming, rust, security, ai)"
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli lobsters tag -f json`
