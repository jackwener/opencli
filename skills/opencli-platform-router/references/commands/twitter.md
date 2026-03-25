# twitter

Auto-generated from `src/clis/twitter` source files.

Total commands: **24**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### accept
- Description: Auto-accept DM requests containing specific keywords
- Risk: high
- Source: `src/clis/twitter/accept.ts`
- Args:
  - `query` (required) — type=string; Keywords to match (comma-separated for OR, e.g.
  - `max` (optional) — type=int; default=20; Maximum number of requests to accept (default: 20)
- Example: `opencli twitter accept -f json`

### article
- Description: Fetch a Twitter Article (long-form content) and export as Markdown
- Risk: low
- Source: `src/clis/twitter/article.ts`
- Args:
  - `tweet-id` (required) — type=string; Tweet ID or URL containing the article
- Example: `opencli twitter article -f json`

### block
- Description: Block a Twitter user
- Risk: high
- Source: `src/clis/twitter/block.ts`
- Args:
  - `username` (required) — type=string; Twitter screen name (without @)
- Example: `opencli twitter block -f json`

### bookmark
- Description: Bookmark a tweet
- Risk: high
- Source: `src/clis/twitter/bookmark.ts`
- Args:
  - `url` (required) — type=string; Tweet URL to bookmark
- Example: `opencli twitter bookmark -f json`

### bookmarks
- Description: Fetch Twitter/X bookmarks
- Risk: high
- Source: `src/clis/twitter/bookmarks.ts`
- Args:
  - `limit` (optional) — type=int; default=20
- Example: `opencli twitter bookmarks -f json`

### delete
- Description: Delete a specific tweet by URL
- Risk: high
- Source: `src/clis/twitter/delete.ts`
- Args:
  - `url` (required) — type=string; The URL of the tweet to delete
- Example: `opencli twitter delete -f json`

### download
- Description: 下载 Twitter/X 媒体（图片和视频）
- Risk: low
- Source: `src/clis/twitter/download.ts`
- Args:
  - `username` (optional) — Twitter username (downloads from media tab)
  - `tweet-url` (optional) — Single tweet URL to download
  - `limit` (optional) — type=int; default=10; Number of tweets to scan
  - `output` (optional) — default='./twitter-downloads'; Output directory
- Example: `opencli twitter download -f json`

### follow
- Description: Follow a Twitter user
- Risk: high
- Source: `src/clis/twitter/follow.ts`
- Args:
  - `username` (required) — type=string; Twitter screen name (without @)
- Example: `opencli twitter follow -f json`

### followers
- Description: Get accounts following a Twitter/X user
- Risk: high
- Source: `src/clis/twitter/followers.ts`
- Args:
  - `user` (optional) — type=string
  - `limit` (optional) — type=int; default=50
- Example: `opencli twitter followers -f json`

### following
- Description: Get accounts a Twitter/X user is following
- Risk: high
- Source: `src/clis/twitter/following.ts`
- Args:
  - `user` (optional) — type=string
  - `limit` (optional) — type=int; default=50
- Example: `opencli twitter following -f json`

### hide-reply
- Description: Hide a reply on your tweet (useful for hiding bot/spam replies)
- Risk: high
- Source: `src/clis/twitter/hide-reply.ts`
- Args:
  - `url` (required) — type=string; The URL of the reply tweet to hide
- Example: `opencli twitter hide-reply -f json`

### like
- Description: Like a specific tweet
- Risk: high
- Source: `src/clis/twitter/like.ts`
- Args:
  - `url` (required) — type=string; The URL of the tweet to like
- Example: `opencli twitter like -f json`

### notifications
- Description: Get Twitter/X notifications
- Risk: low
- Source: `src/clis/twitter/notifications.ts`
- Args:
  - `limit` (optional) — type=int; default=20
- Example: `opencli twitter notifications -f json`

### post
- Description: Post a new tweet/thread
- Risk: high
- Source: `src/clis/twitter/post.ts`
- Args:
  - `text` (required) — type=string; The text content of the tweet
- Example: `opencli twitter post -f json`

### profile
- Description: Fetch a Twitter user profile (bio, stats, etc.)
- Risk: low
- Source: `src/clis/twitter/profile.ts`
- Args:
  - `username` (optional) — type=string; Twitter screen name (without @). Defaults to logged-in user.
- Example: `opencli twitter profile -f json`

### reply
- Description: Reply to a specific tweet
- Risk: high
- Source: `src/clis/twitter/reply.ts`
- Args:
  - `url` (required) — type=string; The URL of the tweet to reply to
  - `text` (required) — type=string; The text content of your reply
- Example: `opencli twitter reply -f json`

### reply-dm
- Description: Send a message to recent DM conversations
- Risk: high
- Source: `src/clis/twitter/reply-dm.ts`
- Args:
  - `text` (required) — type=string; Message text to send (e.g.
  - `max` (optional) — type=int; default=20; Maximum number of conversations to reply to (default: 20)
  - `skip-replied` (optional) — type=boolean; default=true; Skip conversations where you already sent the same text (default: true)
- Example: `opencli twitter reply-dm -f json`

### search
- Description: Search Twitter/X for tweets
- Risk: low
- Source: `src/clis/twitter/search.ts`
- Args:
  - `query` (required) — type=string
  - `limit` (optional) — type=int; default=15
- Example: `opencli twitter search -f json`

### thread
- Description: Get a tweet thread (original + all replies)
- Risk: low
- Source: `src/clis/twitter/thread.ts`
- Args:
  - `tweet-id` (required) — type=string
  - `limit` (optional) — type=int; default=50
- Example: `opencli twitter thread -f json`

### timeline
- Description: Fetch Twitter timeline (for-you or following)
- Risk: low
- Source: `src/clis/twitter/timeline.ts`
- Args:
  - `type` (optional) — default='for-you'; Timeline type: for-you (algorithmic) or following (chronological)
  - `limit` (optional) — type=int; default=20
- Example: `opencli twitter timeline -f json`

### trending
- Description: Twitter/X trending topics
- Risk: low
- Source: `src/clis/twitter/trending.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Number of trends to show
- Example: `opencli twitter trending -f json`

### unblock
- Description: Unblock a Twitter user
- Risk: high
- Source: `src/clis/twitter/unblock.ts`
- Args:
  - `username` (required) — type=string; Twitter screen name (without @)
- Example: `opencli twitter unblock -f json`

### unbookmark
- Description: Remove a tweet from bookmarks
- Risk: high
- Source: `src/clis/twitter/unbookmark.ts`
- Args:
  - `url` (required) — type=string; Tweet URL to unbookmark
- Example: `opencli twitter unbookmark -f json`

### unfollow
- Description: Unfollow a Twitter user
- Risk: high
- Source: `src/clis/twitter/unfollow.ts`
- Args:
  - `username` (required) — type=string; Twitter screen name (without @)
- Example: `opencli twitter unfollow -f json`
