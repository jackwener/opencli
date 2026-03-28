# bilibili

## Commands

### download
- Purpose: Download Bilibili video (requires yt-dlp)
- Args:
  - `bvid`(required): Video BV ID (e.g., BV1xxx)
  - `output`(optional): default: './bilibili-downloads'; Output directory
  - `quality`(optional): default: 'best'; Video quality (best, 1080p, 720p, 480p)
- Usage: `opencli bilibili download [options] -f json`

### dynamic
- Purpose: Get Bilibili user dynamic feed
- Args:
  - `limit`(optional): type: int; default: 15
- Usage: `opencli bilibili dynamic [options] -f json`

### favorite
- Purpose: My default favorites folder
- Args:
  - `limit`(optional): type: int; default: 20; Number of results
  - `page`(optional): type: int; default: 1; Page number
- Usage: `opencli bilibili favorite [options] -f json`

### feed
- Purpose: Following feed timeline
- Args:
  - `limit`(optional): type: int; default: 20; Number of results
  - `type`(optional): default: 'all'; Filter: all, video, article
- Usage: `opencli bilibili feed [options] -f json`

### following
- Purpose: Get a Bilibili user's following list
- Args:
  - `uid`(optional): Target user ID (defaults to current logged-in user)
  - `page`(optional): type: int; default: 1; Page number
  - `limit`(optional): type: int; default: 50; Items per page (max 50)
- Usage: `opencli bilibili following [options] -f json`

### history
- Purpose: My watch history
- Args:
  - `limit`(optional): type: int; default: 20; Number of results
- Usage: `opencli bilibili history [options] -f json`

### hot
- Purpose: Bilibili hot videos
- Args:
  - `limit`(optional): type: int; default: 20; Number of videos
- Usage: `opencli bilibili hot [options] -f json`

### me
- Purpose: My Bilibili profile info
- Args: None
- Usage: `opencli bilibili me [options] -f json`

### ranking
- Purpose: Get Bilibili video ranking board
- Args:
  - `limit`(optional): type: int; default: 20
- Usage: `opencli bilibili ranking [options] -f json`

### search
- Purpose: Search Bilibili videos or users
- Args:
  - `query`(required): Search keyword
  - `type`(optional): default: 'video'; video or user
  - `page`(optional): type: int; default: 1; Result page
  - `limit`(optional): type: int; default: 20; Number of results
- Usage: `opencli bilibili search [options] -f json`

### subtitle
- Purpose: Get subtitles for a Bilibili video
- Args:
  - `bvid`(required)
  - `lang`(optional): Subtitle language code (e.g. zh-CN, en-US, ai-zh); defaults to first available
- Usage: `opencli bilibili subtitle [options] -f json`

### user-videos
- Purpose: List videos posted by a specific user
- Args:
  - `uid`(required): User UID or username
  - `limit`(optional): type: int; default: 20; Number of results
  - `order`(optional): default: 'pubdate'; Sort: pubdate, click, stow
  - `page`(optional): type: int; default: 1; Page number
- Usage: `opencli bilibili user-videos [options] -f json`
