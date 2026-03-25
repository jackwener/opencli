# jike

## Commands

### comment
- Purpose: Comment on a Jike post
- Args:
  - `id`(required): type: string; Post ID
  - `text`(required): type: string; Comment content
- Usage: `opencli jike comment [options] -f json`

### create
- Purpose: Create a Jike post
- Args:
  - `text`(required): type: string; Post body content
- Usage: `opencli jike create [options] -f json`

### feed
- Purpose: Jike home feed
- Args:
  - `limit`(optional): type: int; default: 20
- Usage: `opencli jike feed [options] -f json`

### like
- Purpose: Like a Jike post
- Args:
  - `id`(required): type: string; Post ID
- Usage: `opencli jike like [options] -f json`

### notifications
- Purpose: Jike notifications
- Args:
  - `limit`(optional): type: int; default: 20
- Usage: `opencli jike notifications [options] -f json`

### post
- Purpose: Jike post detail with comments
- Args:
  - `id`(required): type: string; Post ID (from post URL)
- Usage: `opencli jike post [options] -f json`

### repost
- Purpose: Repost a Jike post
- Args:
  - `id`(required): type: string; Post ID
  - `text`(optional): type: string; Repost message (optional)
- Usage: `opencli jike repost [options] -f json`

### search
- Purpose: Search Jike posts
- Args:
  - `query`(required): type: string
  - `limit`(optional): type: int; default: 20
- Usage: `opencli jike search [options] -f json`

### topic
- Purpose: Jike topic/circle posts
- Args:
  - `id`(required): type: string; Topic ID (from topic URL, e.g. 553870e8e4b0cafb0a1bef68)
  - `limit`(optional): type: int; default: 20; Number of posts
- Usage: `opencli jike topic [options] -f json`

### user
- Purpose: Jike user posts
- Args:
  - `username`(required): type: string; Username from profile URL (e.g. wenhao1996)
  - `limit`(optional): type: int; default: 20; Number of posts
- Usage: `opencli jike user [options] -f json`
