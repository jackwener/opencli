# medium

Auto-generated from `src/clis/medium` source files.

Total commands: **3**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### feed
- Description: Medium 热门文章 Feed
- Risk: low
- Source: `src/clis/medium/feed.ts`
- Args:
  - `topic` (optional) — default=''; 话题标签（如 technology, programming, ai）
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli medium feed -f json`

### search
- Description: 搜索 Medium 文章
- Risk: low
- Source: `src/clis/medium/search.ts`
- Args:
  - `keyword` (required) — 搜索关键词
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli medium search -f json`

### user
- Description: 获取 Medium 用户的文章列表
- Risk: low
- Source: `src/clis/medium/user.ts`
- Args:
  - `username` (required) — Medium 用户名（如 @username 或 username）
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli medium user -f json`
