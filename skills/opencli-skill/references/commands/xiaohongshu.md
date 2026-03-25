# xiaohongshu

## Commands

### creator-note-detail
- Purpose: Xiaohongshu single-note analytics detail (note info + engagement metrics + traffic sources + audience profile + trends)
- Args:
  - `note-id`(required): type: string; Note ID (from creator-notes or note-detail page URL)
- Usage: `opencli xiaohongshu creator-note-detail [options] -f json`

### creator-notes
- Purpose: Xiaohongshu creator notes list with per-note metrics (title/date/views/likes/favorites/comments)
- Args:
  - `limit`(optional): type: int; default: 20; Number of notes to return
- Usage: `opencli xiaohongshu creator-notes [options] -f json`

### creator-notes-summary
- Purpose: Batch summary for recent Xiaohongshu notes (list + key metrics)
- Args:
  - `limit`(optional): type: int; default: 3; Number of recent notes to summarize
- Usage: `opencli xiaohongshu creator-notes-summary [options] -f json`

### creator-profile
- Purpose: Xiaohongshu creator profile metrics (followers/following/likes received/creator level)
- Args: None
- Usage: `opencli xiaohongshu creator-profile [options] -f json`

### creator-stats
- Purpose: Xiaohongshu creator analytics overview (views/likes/favorites/comments/shares/follower growth with daily trend)
- Args:
  - `period`(optional): type: string; default: 'seven'; Stats period: seven or thirty
- Usage: `opencli xiaohongshu creator-stats [options] -f json`

### download
- Purpose: Download images and videos from a Xiaohongshu note
- Args:
  - `note-id`(required): Note ID (from URL)
  - `output`(optional): default: './xiaohongshu-downloads'; Output directory
- Usage: `opencli xiaohongshu download [options] -f json`

### feed
- Purpose: Xiaohongshu home recommendation feed (via Pinia Store action)
- Args:
  - `limit`(optional): type: int; default: 20; Number of items to return
- Usage: `opencli xiaohongshu feed [options] -f json`

### notifications
- Purpose: Xiaohongshu notifications (mentions/likes/connections)
- Args:
  - `type`(optional): type: str; default: mentions; "Notification type: mentions, likes, or connections"
  - `limit`(optional): type: int; default: 20; Number of notifications to return
- Usage: `opencli xiaohongshu notifications [options] -f json`

### publish
- Purpose: Publish Xiaohongshu image-text note (creator center UI automation)
- Args:
  - `title`(required): Note title (max 20 characters)
  - `content`(required): Note content
  - `images`(optional): Image file paths, comma-separated, up to 9 files (jpg/png/gif/webp)
  - `topics`(optional): Topic tags, comma-separated, without #
  - `draft`(optional): type: bool; default: false; Save as draft without publishing
- Usage: `opencli xiaohongshu publish [options] -f json`

### search
- Purpose: Search Xiaohongshu notes
- Args:
  - `query`(required): Search keyword
  - `limit`(optional): type: int; default: 20; Number of results
- Usage: `opencli xiaohongshu search [options] -f json`

### user
- Purpose: Get public notes from a Xiaohongshu user profile
- Args:
  - `id`(required): type: string; User id or profile URL
  - `limit`(optional): type: int; default: 15; Number of notes to return
- Usage: `opencli xiaohongshu user [options] -f json`
