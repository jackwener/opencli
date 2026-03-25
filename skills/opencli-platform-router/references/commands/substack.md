# substack

Auto-generated from `src/clis/substack` source files.

Total commands: **3**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### feed
- Description: Substack 热门文章 Feed
- Risk: low
- Source: `src/clis/substack/feed.ts`
- Args:
  - `category` (optional) — default='all'; 文章分类: all, tech, business, culture, politics, science, health
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli substack feed -f json`

### publication
- Description: 获取特定 Substack Newsletter 的最新文章
- Risk: low
- Source: `src/clis/substack/publication.ts`
- Args:
  - `url` (required) — Newsletter URL（如 https://example.substack.com）
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli substack publication -f json`

### search
- Description: 搜索 Substack 文章和 Newsletter
- Risk: low
- Source: `src/clis/substack/search.ts`
- Args:
  - `keyword` (required) — 搜索关键词
  - `type` (optional) — default='posts'; 搜索类型（posts=文章, publications=Newsletter）
  - `limit` (optional) — type=int; default=20; 返回结果数量
- Example: `opencli substack search -f json`
