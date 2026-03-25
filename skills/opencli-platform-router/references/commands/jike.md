# jike

Auto-generated from `src/clis/jike` source files.

Total commands: **10**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### comment
- Description: 评论即刻帖子
- Risk: high
- Source: `src/clis/jike/comment.ts`
- Args:
  - `id` (required) — type=string; 帖子 ID
  - `text` (required) — type=string; 评论内容
- Example: `opencli jike comment -f json`

### create
- Description: 发布即刻动态
- Risk: low
- Source: `src/clis/jike/create.ts`
- Args:
  - `text` (required) — type=string; 动态正文内容
- Example: `opencli jike create -f json`

### feed
- Description: 即刻首页动态流
- Risk: low
- Source: `src/clis/jike/feed.ts`
- Args:
  - `limit` (optional) — type=int; default=20
- Example: `opencli jike feed -f json`

### like
- Description: 点赞即刻帖子
- Risk: high
- Source: `src/clis/jike/like.ts`
- Args:
  - `id` (required) — type=string; 帖子 ID
- Example: `opencli jike like -f json`

### notifications
- Description: 即刻通知
- Risk: low
- Source: `src/clis/jike/notifications.ts`
- Args:
  - `limit` (optional) — type=int; default=20
- Example: `opencli jike notifications -f json`

### post
- Description: 即刻帖子详情及评论
- Risk: high
- Source: `src/clis/jike/post.yaml`
- Args:
  - `id` (required) — type=string; Post ID (from post URL)
- Example: `opencli jike post -f json`

### repost
- Description: 转发即刻帖子
- Risk: high
- Source: `src/clis/jike/repost.ts`
- Args:
  - `id` (required) — type=string; 帖子 ID
  - `text` (optional) — type=string; 转发附言（可选）
- Example: `opencli jike repost -f json`

### search
- Description: 搜索即刻帖子
- Risk: low
- Source: `src/clis/jike/search.ts`
- Args:
  - `query` (required) — type=string
  - `limit` (optional) — type=int; default=20
- Example: `opencli jike search -f json`

### topic
- Description: 即刻话题/圈子帖子
- Risk: low
- Source: `src/clis/jike/topic.yaml`
- Args:
  - `id` (required) — type=string; Topic ID (from topic URL, e.g. 553870e8e4b0cafb0a1bef68)
  - `limit` (optional) — type=int; default=20; Number of posts
- Example: `opencli jike topic -f json`

### user
- Description: 即刻用户动态
- Risk: low
- Source: `src/clis/jike/user.yaml`
- Args:
  - `username` (required) — type=string; Username from profile URL (e.g. wenhao1996)
  - `limit` (optional) — type=int; default=20; Number of posts
- Example: `opencli jike user -f json`
