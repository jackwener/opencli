# instagram

## Commands

### comment
- Purpose: Comment on an Instagram post
- Args:
  - `username`(required): type: str; Username of the post author
  - `text`(required): type: str; Comment text
  - `index`(optional): type: int; default: 1; Post index (1 = most recent)
- Usage: `opencli instagram comment [options] -f json`

### explore
- Purpose: Instagram explore/discover trending posts
- Args:
  - `limit`(optional): type: int; default: 20; Number of posts
- Usage: `opencli instagram explore [options] -f json`

### follow
- Purpose: Follow an Instagram user
- Args:
  - `username`(required): type: str; Instagram username to follow
- Usage: `opencli instagram follow [options] -f json`

### followers
- Purpose: List followers of an Instagram user
- Args:
  - `username`(required): type: str; Instagram username
  - `limit`(optional): type: int; default: 20; Number of followers
- Usage: `opencli instagram followers [options] -f json`

### following
- Purpose: List accounts an Instagram user is following
- Args:
  - `username`(required): type: str; Instagram username
  - `limit`(optional): type: int; default: 20; Number of accounts
- Usage: `opencli instagram following [options] -f json`

### like
- Purpose: Like an Instagram post
- Args:
  - `username`(required): type: str; Username of the post author
  - `index`(optional): type: int; default: 1; Post index (1 = most recent)
- Usage: `opencli instagram like [options] -f json`

### profile
- Purpose: Get Instagram user profile info
- Args:
  - `username`(required): type: str; Instagram username
- Usage: `opencli instagram profile [options] -f json`

### save
- Purpose: Save (bookmark) an Instagram post
- Args:
  - `username`(required): type: str; Username of the post author
  - `index`(optional): type: int; default: 1; Post index (1 = most recent)
- Usage: `opencli instagram save [options] -f json`

### saved
- Purpose: Get your saved Instagram posts
- Args:
  - `limit`(optional): type: int; default: 20; Number of saved posts
- Usage: `opencli instagram saved [options] -f json`

### search
- Purpose: Search Instagram users
- Args:
  - `query`(required): type: str; Search query
  - `limit`(optional): type: int; default: 10; Number of results
- Usage: `opencli instagram search [options] -f json`

### unfollow
- Purpose: Unfollow an Instagram user
- Args:
  - `username`(required): type: str; Instagram username to unfollow
- Usage: `opencli instagram unfollow [options] -f json`

### unlike
- Purpose: Unlike an Instagram post
- Args:
  - `username`(required): type: str; Username of the post author
  - `index`(optional): type: int; default: 1; Post index (1 = most recent)
- Usage: `opencli instagram unlike [options] -f json`

### unsave
- Purpose: Unsave (remove bookmark) an Instagram post
- Args:
  - `username`(required): type: str; Username of the post author
  - `index`(optional): type: int; default: 1; Post index (1 = most recent)
- Usage: `opencli instagram unsave [options] -f json`

### user
- Purpose: Get recent posts from an Instagram user
- Args:
  - `username`(required): type: str; Instagram username
  - `limit`(optional): type: int; default: 12; Number of posts
- Usage: `opencli instagram user [options] -f json`
