# weibo

Auto-generated from `src/clis/weibo` source files.

Total commands: **2**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### hot
- Description: 微博热搜
- Risk: low
- Source: `src/clis/weibo/hot.ts`
- Args:
  - `limit` (optional) — type=int; default=30; Number of items (max 50)
- Example: `opencli weibo hot -f json`

### search
- Description: 搜索微博
- Risk: low
- Source: `src/clis/weibo/search.ts`
- Args:
  - `keyword` (required) — Search keyword
  - `limit` (optional) — type=int; default=10; Number of results (max 50)
- Example: `opencli weibo search -f json`
