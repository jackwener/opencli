# facebook

Auto-generated from `src/clis/facebook` source files.

Total commands: **10**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### add-friend
- Description: Send a friend request on Facebook
- Risk: low
- Source: `src/clis/facebook/add-friend.yaml`
- Args:
  - `username` (required) — type=str; Facebook username or profile URL
- Example: `opencli facebook add-friend -f json`

### events
- Description: Browse Facebook event categories
- Risk: low
- Source: `src/clis/facebook/events.yaml`
- Args:
  - `limit` (optional) — type=int; default=15; Number of categories
- Example: `opencli facebook events -f json`

### feed
- Description: Get your Facebook news feed
- Risk: low
- Source: `src/clis/facebook/feed.yaml`
- Args:
  - `limit` (optional) — type=int; default=10; Number of posts
- Example: `opencli facebook feed -f json`

### friends
- Description: Get Facebook friend suggestions
- Risk: low
- Source: `src/clis/facebook/friends.yaml`
- Args:
  - `limit` (optional) — type=int; default=10; Number of friend suggestions
- Example: `opencli facebook friends -f json`

### groups
- Description: List your Facebook groups
- Risk: low
- Source: `src/clis/facebook/groups.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of groups
- Example: `opencli facebook groups -f json`

### join-group
- Description: Join a Facebook group
- Risk: low
- Source: `src/clis/facebook/join-group.yaml`
- Args:
  - `group` (required) — type=str; Group ID or URL path (e.g. '1876150192925481' or group name)
- Example: `opencli facebook join-group -f json`

### memories
- Description: Get your Facebook memories (On This Day)
- Risk: low
- Source: `src/clis/facebook/memories.yaml`
- Args:
  - `limit` (optional) — type=int; default=10; Number of memories
- Example: `opencli facebook memories -f json`

### notifications
- Description: Get recent Facebook notifications
- Risk: low
- Source: `src/clis/facebook/notifications.yaml`
- Args:
  - `limit` (optional) — type=int; default=15; Number of notifications
- Example: `opencli facebook notifications -f json`

### profile
- Description: Get Facebook user/page profile info
- Risk: low
- Source: `src/clis/facebook/profile.yaml`
- Args:
  - `username` (required) — type=str; Facebook username or page name
- Example: `opencli facebook profile -f json`

### search
- Description: Search Facebook for people, pages, or posts
- Risk: low
- Source: `src/clis/facebook/search.yaml`
- Args:
  - `query` (required) — type=str; Search query
  - `limit` (optional) — type=int; default=10; Number of results
- Example: `opencli facebook search -f json`
