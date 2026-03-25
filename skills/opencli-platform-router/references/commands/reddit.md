# reddit

Auto-generated from `src/clis/reddit` source files.

Total commands: **15**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### comment
- Description: Post a comment on a Reddit post
- Risk: high
- Source: `src/clis/reddit/comment.ts`
- Args:
  - `post-id` (required) — type=string; Post ID (e.g. 1abc123) or fullname (t3_xxx)
  - `text` (required) — type=string; Comment text
- Example: `opencli reddit comment -f json`

### frontpage
- Description: Reddit Frontpage / r/all
- Risk: low
- Source: `src/clis/reddit/frontpage.yaml`
- Args:
  - `limit` (optional) — type=int; default=15
- Example: `opencli reddit frontpage -f json`

### hot
- Description: Reddit 热门帖子
- Risk: low
- Source: `src/clis/reddit/hot.yaml`
- Args:
  - `subreddit` (optional) — type=str; default=""; "Subreddit name (e.g. programming). Empty for frontpage"
  - `limit` (optional) — type=int; default=20; Number of posts
- Example: `opencli reddit hot -f json`

### popular
- Description: Reddit Popular posts (/r/popular)
- Risk: low
- Source: `src/clis/reddit/popular.yaml`
- Args:
  - `limit` (optional) — type=int; default=20
- Example: `opencli reddit popular -f json`

### read
- Description: Read a Reddit post and its comments
- Risk: low
- Source: `src/clis/reddit/read.ts`
- Args:
  - `post-id` (required) — Post ID (e.g. 1abc123) or full URL
  - `sort` (optional) — default='best'; Comment sort: best, top, new, controversial, old, qa
  - `limit` (optional) — type=int; default=25; Number of top-level comments
  - `depth` (optional) — type=int; default=2; Max reply depth (1=no replies, 2=one level of replies, etc.)
  - `replies` (optional) — type=int; default=5; Max replies shown per comment at each level (sorted by score)
  - `max-length` (optional) — type=int; default=2000; Max characters per comment body (min 100)
- Example: `opencli reddit read -f json`

### save
- Description: Save or unsave a Reddit post
- Risk: low
- Source: `src/clis/reddit/save.ts`
- Args:
  - `post-id` (required) — type=string; Post ID (e.g. 1abc123) or fullname (t3_xxx)
  - `undo` (optional) — type=boolean; default=false; Unsave instead of save
- Example: `opencli reddit save -f json`

### saved
- Description: Browse your saved Reddit posts
- Risk: low
- Source: `src/clis/reddit/saved.ts`
- Args:
  - `limit` (optional) — type=int; default=15
- Example: `opencli reddit saved -f json`

### search
- Description: Search Reddit Posts
- Risk: low
- Source: `src/clis/reddit/search.yaml`
- Args:
  - `query` (required) — type=string
  - `subreddit` (optional) — type=string; default=""; "Search within a specific subreddit"
  - `sort` (optional) — type=string; default=relevance; "Sort order: relevance, hot, top, new, comments"
  - `time` (optional) — type=string; default=all; "Time filter: hour, day, week, month, year, all"
  - `limit` (optional) — type=int; default=15
- Example: `opencli reddit search -f json`

### subreddit
- Description: Get posts from a specific Subreddit
- Risk: low
- Source: `src/clis/reddit/subreddit.yaml`
- Args:
  - `name` (required) — type=string
  - `sort` (optional) — type=string; default=hot; "Sorting method: hot, new, top, rising, controversial"
  - `time` (optional) — type=string; default=all; "Time filter for top/controversial: hour, day, week, month, year, all"
  - `limit` (optional) — type=int; default=15
- Example: `opencli reddit subreddit -f json`

### subscribe
- Description: Subscribe or unsubscribe to a subreddit
- Risk: low
- Source: `src/clis/reddit/subscribe.ts`
- Args:
  - `subreddit` (required) — type=string; Subreddit name (e.g. python)
  - `undo` (optional) — type=boolean; default=false; Unsubscribe instead of subscribe
- Example: `opencli reddit subscribe -f json`

### upvote
- Description: Upvote or downvote a Reddit post
- Risk: low
- Source: `src/clis/reddit/upvote.ts`
- Args:
  - `post-id` (required) — type=string; Post ID (e.g. 1abc123) or fullname (t3_xxx)
  - `direction` (optional) — type=string; default='up'; Vote direction: up, down, none
- Example: `opencli reddit upvote -f json`

### upvoted
- Description: Browse your upvoted Reddit posts
- Risk: low
- Source: `src/clis/reddit/upvoted.ts`
- Args:
  - `limit` (optional) — type=int; default=15
- Example: `opencli reddit upvoted -f json`

### user
- Description: View a Reddit user profile
- Risk: low
- Source: `src/clis/reddit/user.yaml`
- Args:
  - `username` (required) — type=string
- Example: `opencli reddit user -f json`

### user-comments
- Description: View a Reddit user's comment history
- Risk: low
- Source: `src/clis/reddit/user-comments.yaml`
- Args:
  - `username` (required) — type=string
  - `limit` (optional) — type=int; default=15
- Example: `opencli reddit user-comments -f json`

### user-posts
- Description: View a Reddit user's submitted posts
- Risk: high
- Source: `src/clis/reddit/user-posts.yaml`
- Args:
  - `username` (required) — type=string
  - `limit` (optional) — type=int; default=15
- Example: `opencli reddit user-posts -f json`
