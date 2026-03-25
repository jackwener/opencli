# facebook

## Commands

### add-friend
- Purpose: Send a friend request on Facebook
- Args:
  - `username`(required): type: str; Facebook username or profile URL
- Usage: `opencli facebook add-friend [options] -f json`

### events
- Purpose: Browse Facebook event categories
- Args:
  - `limit`(optional): type: int; default: 15; Number of categories
- Usage: `opencli facebook events [options] -f json`

### feed
- Purpose: Get your Facebook news feed
- Args:
  - `limit`(optional): type: int; default: 10; Number of posts
- Usage: `opencli facebook feed [options] -f json`

### friends
- Purpose: Get Facebook friend suggestions
- Args:
  - `limit`(optional): type: int; default: 10; Number of friend suggestions
- Usage: `opencli facebook friends [options] -f json`

### groups
- Purpose: List your Facebook groups
- Args:
  - `limit`(optional): type: int; default: 20; Number of groups
- Usage: `opencli facebook groups [options] -f json`

### join-group
- Purpose: Join a Facebook group
- Args:
  - `group`(required): type: str; Group ID or URL path (e.g. '1876150192925481' or group name)
- Usage: `opencli facebook join-group [options] -f json`

### memories
- Purpose: Get your Facebook memories (On This Day)
- Args:
  - `limit`(optional): type: int; default: 10; Number of memories
- Usage: `opencli facebook memories [options] -f json`

### notifications
- Purpose: Get recent Facebook notifications
- Args:
  - `limit`(optional): type: int; default: 15; Number of notifications
- Usage: `opencli facebook notifications [options] -f json`

### profile
- Purpose: Get Facebook user/page profile info
- Args:
  - `username`(required): type: str; Facebook username or page name
- Usage: `opencli facebook profile [options] -f json`

### search
- Purpose: Search Facebook for people, pages, or posts
- Args:
  - `query`(required): type: str; Search query
  - `limit`(optional): type: int; default: 10; Number of results
- Usage: `opencli facebook search [options] -f json`
