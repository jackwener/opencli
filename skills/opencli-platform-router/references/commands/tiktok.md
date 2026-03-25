# tiktok

Auto-generated from `src/clis/tiktok` source files.

Total commands: **15**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### comment
- Description: Comment on a TikTok video
- Risk: high
- Source: `src/clis/tiktok/comment.yaml`
- Args:
  - `url` (required) — type=str; TikTok video URL
  - `text` (required) — type=str; Comment text
- Example: `opencli tiktok comment -f json`

### explore
- Description: Get trending TikTok videos from explore page
- Risk: low
- Source: `src/clis/tiktok/explore.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of videos
- Example: `opencli tiktok explore -f json`

### follow
- Description: Follow a TikTok user
- Risk: high
- Source: `src/clis/tiktok/follow.yaml`
- Args:
  - `username` (required) — type=str; TikTok username (without @)
- Example: `opencli tiktok follow -f json`

### following
- Description: List accounts you follow on TikTok
- Risk: high
- Source: `src/clis/tiktok/following.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of accounts
- Example: `opencli tiktok following -f json`

### friends
- Description: Get TikTok friend suggestions
- Risk: low
- Source: `src/clis/tiktok/friends.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of suggestions
- Example: `opencli tiktok friends -f json`

### like
- Description: Like a TikTok video
- Risk: high
- Source: `src/clis/tiktok/like.yaml`
- Args:
  - `url` (required) — type=str; TikTok video URL
- Example: `opencli tiktok like -f json`

### live
- Description: Browse live streams on TikTok
- Risk: low
- Source: `src/clis/tiktok/live.yaml`
- Args:
  - `limit` (optional) — type=int; default=10; Number of streams
- Example: `opencli tiktok live -f json`

### notifications
- Description: Get TikTok notifications (likes, comments, mentions, followers)
- Risk: low
- Source: `src/clis/tiktok/notifications.yaml`
- Args:
  - `limit` (optional) — type=int; default=15; Number of notifications
  - `type` (optional) — type=str; default=all; Notification type
- Example: `opencli tiktok notifications -f json`

### profile
- Description: Get TikTok user profile info
- Risk: low
- Source: `src/clis/tiktok/profile.yaml`
- Args:
  - `username` (required) — type=str; TikTok username (without @)
- Example: `opencli tiktok profile -f json`

### save
- Description: Add a TikTok video to Favorites
- Risk: low
- Source: `src/clis/tiktok/save.yaml`
- Args:
  - `url` (required) — type=str; TikTok video URL
- Example: `opencli tiktok save -f json`

### search
- Description: Search TikTok videos
- Risk: low
- Source: `src/clis/tiktok/search.yaml`
- Args:
  - `query` (required) — type=str; Search query
  - `limit` (optional) — type=int; default=10; Number of results
- Example: `opencli tiktok search -f json`

### unfollow
- Description: Unfollow a TikTok user
- Risk: high
- Source: `src/clis/tiktok/unfollow.yaml`
- Args:
  - `username` (required) — type=str; TikTok username (without @)
- Example: `opencli tiktok unfollow -f json`

### unlike
- Description: Unlike a TikTok video
- Risk: high
- Source: `src/clis/tiktok/unlike.yaml`
- Args:
  - `url` (required) — type=str; TikTok video URL
- Example: `opencli tiktok unlike -f json`

### unsave
- Description: Remove a TikTok video from Favorites
- Risk: low
- Source: `src/clis/tiktok/unsave.yaml`
- Args:
  - `url` (required) — type=str; TikTok video URL
- Example: `opencli tiktok unsave -f json`

### user
- Description: Get recent videos from a TikTok user
- Risk: low
- Source: `src/clis/tiktok/user.yaml`
- Args:
  - `username` (required) — type=str; TikTok username (without @)
  - `limit` (optional) — type=int; default=10; Number of videos
- Example: `opencli tiktok user -f json`
