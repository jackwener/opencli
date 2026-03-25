# linux-do

Auto-generated from `src/clis/linux-do` source files.

Total commands: **6**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### categories
- Description: linux.do 分类列表
- Risk: low
- Source: `src/clis/linux-do/categories.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of categories
- Example: `opencli linux-do categories -f json`

### category
- Description: linux.do 分类内话题
- Risk: low
- Source: `src/clis/linux-do/category.yaml`
- Args:
  - `slug` (required) — type=str; Category slug (use 'categories' command to find)
  - `id` (required) — type=int; Category ID (use 'categories' command to find)
  - `limit` (optional) — type=int; default=20; Number of topics
- Example: `opencli linux-do category -f json`

### hot
- Description: linux.do 热门话题
- Risk: low
- Source: `src/clis/linux-do/hot.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of topics
  - `period` (optional) — type=str; default=weekly; Time period
- Example: `opencli linux-do hot -f json`

### latest
- Description: linux.do 最新话题
- Risk: low
- Source: `src/clis/linux-do/latest.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of topics
- Example: `opencli linux-do latest -f json`

### search
- Description: 搜索 linux.do
- Risk: low
- Source: `src/clis/linux-do/search.yaml`
- Args:
  - `query` (required) — type=str; Search query
  - `limit` (optional) — type=int; default=20; Number of results
- Example: `opencli linux-do search -f json`

### topic
- Description: linux.do 帖子详情和回复（首页）
- Risk: low
- Source: `src/clis/linux-do/topic.yaml`
- Args:
  - `id` (required) — type=int; Topic ID
- Example: `opencli linux-do topic -f json`
