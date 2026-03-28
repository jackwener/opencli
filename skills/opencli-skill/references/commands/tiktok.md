# tiktok

## Commands

### comment
- Purpose: Comment on a TikTok video
- Args:
  - `url`(required): type: str; TikTok video URL
  - `text`(required): type: str; Comment text
- Usage: `opencli tiktok comment [options] -f json`

### explore
- Purpose: Get trending TikTok videos from explore page
- Args:
  - `limit`(optional): type: int; default: 20; Number of videos
- Usage: `opencli tiktok explore [options] -f json`

### follow
- Purpose: Follow a TikTok user
- Args:
  - `username`(required): type: str; TikTok username (without @)
- Usage: `opencli tiktok follow [options] -f json`

### following
- Purpose: List accounts you follow on TikTok
- Args:
  - `limit`(optional): type: int; default: 20; Number of accounts
- Usage: `opencli tiktok following [options] -f json`

### friends
- Purpose: Get TikTok friend suggestions
- Args:
  - `limit`(optional): type: int; default: 20; Number of suggestions
- Usage: `opencli tiktok friends [options] -f json`

### like
- Purpose: Like a TikTok video
- Args:
  - `url`(required): type: str; TikTok video URL
- Usage: `opencli tiktok like [options] -f json`

### live
- Purpose: Browse live streams on TikTok
- Args:
  - `limit`(optional): type: int; default: 10; Number of streams
- Usage: `opencli tiktok live [options] -f json`

### notifications
- Purpose: Get TikTok notifications (likes, comments, mentions, followers)
- Args:
  - `limit`(optional): type: int; default: 15; Number of notifications
  - `type`(optional): type: str; default: all; Notification type
- Usage: `opencli tiktok notifications [options] -f json`

### profile
- Purpose: Get TikTok user profile info
- Args:
  - `username`(required): type: str; TikTok username (without @)
- Usage: `opencli tiktok profile [options] -f json`

### save
- Purpose: Add a TikTok video to Favorites
- Args:
  - `url`(required): type: str; TikTok video URL
- Usage: `opencli tiktok save [options] -f json`

### search
- Purpose: Search TikTok videos
- Args:
  - `query`(required): type: str; Search query
  - `limit`(optional): type: int; default: 10; Number of results
- Usage: `opencli tiktok search [options] -f json`

### unfollow
- Purpose: Unfollow a TikTok user
- Args:
  - `username`(required): type: str; TikTok username (without @)
- Usage: `opencli tiktok unfollow [options] -f json`

### unlike
- Purpose: Unlike a TikTok video
- Args:
  - `url`(required): type: str; TikTok video URL
- Usage: `opencli tiktok unlike [options] -f json`

### unsave
- Purpose: Remove a TikTok video from Favorites
- Args:
  - `url`(required): type: str; TikTok video URL
- Usage: `opencli tiktok unsave [options] -f json`

### user
- Purpose: Get recent videos from a TikTok user
- Args:
  - `username`(required): type: str; TikTok username (without @)
  - `limit`(optional): type: int; default: 10; Number of videos
- Usage: `opencli tiktok user [options] -f json`
