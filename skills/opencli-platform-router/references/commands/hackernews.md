# hackernews

Auto-generated from `src/clis/hackernews` source files.

Total commands: **8**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Hacker News Ask HN posts
- Risk: low
- Source: `src/clis/hackernews/ask.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli hackernews ask -f json`

### best
- Description: Hacker News best stories
- Risk: low
- Source: `src/clis/hackernews/best.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli hackernews best -f json`

### jobs
- Description: Hacker News job postings
- Risk: low
- Source: `src/clis/hackernews/jobs.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of job postings
- Example: `opencli hackernews jobs -f json`

### new
- Description: Hacker News newest stories
- Risk: low
- Source: `src/clis/hackernews/new.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli hackernews new -f json`

### search
- Description: Search Hacker News stories
- Risk: low
- Source: `src/clis/hackernews/search.yaml`
- Args:
  - `query` (required) — type=str; Search query
  - `limit` (optional) — type=int; default=20; Number of results
  - `sort` (optional) — type=str; default=relevance; Sort by relevance or date
- Example: `opencli hackernews search -f json`

### show
- Description: Hacker News Show HN posts
- Risk: low
- Source: `src/clis/hackernews/show.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli hackernews show -f json`

### top
- Description: Hacker News top stories
- Risk: low
- Source: `src/clis/hackernews/top.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of stories
- Example: `opencli hackernews top -f json`

### user
- Description: Hacker News user profile
- Risk: low
- Source: `src/clis/hackernews/user.yaml`
- Args:
  - `username` (required) — type=str; HN username
- Example: `opencli hackernews user -f json`
