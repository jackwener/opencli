# reddit

## Commands

### comment
- Purpose: Post a comment on a Reddit post
- Args:
  - `post-id`(required): type: string; Post ID (e.g. 1abc123) or fullname (t3_xxx)
  - `text`(required): type: string; Comment text
- Usage: `opencli reddit comment [options] -f json`

### frontpage
- Purpose: Reddit Frontpage / r/all
- Args:
  - `limit`(optional): type: int; default: 15
- Usage: `opencli reddit frontpage [options] -f json`

### hot
- Purpose: Reddit hot posts
- Args:
  - `subreddit`(optional): type: str; default: ""; "Subreddit name (e.g. programming). Empty for frontpage"
  - `limit`(optional): type: int; default: 20; Number of posts
- Usage: `opencli reddit hot [options] -f json`

### popular
- Purpose: Reddit Popular posts (/r/popular)
- Args:
  - `limit`(optional): type: int; default: 20
- Usage: `opencli reddit popular [options] -f json`

### read
- Purpose: Read a Reddit post and its comments
- Args:
  - `post-id`(required): Post ID (e.g. 1abc123) or full URL
  - `sort`(optional): default: 'best'; Comment sort: best, top, new, controversial, old, qa
  - `limit`(optional): type: int; default: 25; Number of top-level comments
  - `depth`(optional): type: int; default: 2; Max reply depth (1=no replies, 2=one level of replies, etc.)
  - `replies`(optional): type: int; default: 5; Max replies shown per comment at each level (sorted by score)
  - `max-length`(optional): type: int; default: 2000; Max characters per comment body (min 100)
- Usage: `opencli reddit read [options] -f json`

### save
- Purpose: Save or unsave a Reddit post
- Args:
  - `post-id`(required): type: string; Post ID (e.g. 1abc123) or fullname (t3_xxx)
  - `undo`(optional): type: boolean; default: false; Unsave instead of save
- Usage: `opencli reddit save [options] -f json`

### saved
- Purpose: Browse your saved Reddit posts
- Args:
  - `limit`(optional): type: int; default: 15
- Usage: `opencli reddit saved [options] -f json`

### search
- Purpose: Search Reddit Posts
- Args:
  - `query`(required): type: string
  - `subreddit`(optional): type: string; default: ""; "Search within a specific subreddit"
  - `sort`(optional): type: string; default: relevance; "Sort order: relevance, hot, top, new, comments"
  - `time`(optional): type: string; default: all; "Time filter: hour, day, week, month, year, all"
  - `limit`(optional): type: int; default: 15
- Usage: `opencli reddit search [options] -f json`

### subreddit
- Purpose: Get posts from a specific Subreddit
- Args:
  - `name`(required): type: string
  - `sort`(optional): type: string; default: hot; "Sorting method: hot, new, top, rising, controversial"
  - `time`(optional): type: string; default: all; "Time filter for top/controversial: hour, day, week, month, year, all"
  - `limit`(optional): type: int; default: 15
- Usage: `opencli reddit subreddit [options] -f json`

### subscribe
- Purpose: Subscribe or unsubscribe to a subreddit
- Args:
  - `subreddit`(required): type: string; Subreddit name (e.g. python)
  - `undo`(optional): type: boolean; default: false; Unsubscribe instead of subscribe
- Usage: `opencli reddit subscribe [options] -f json`

### upvote
- Purpose: Upvote or downvote a Reddit post
- Args:
  - `post-id`(required): type: string; Post ID (e.g. 1abc123) or fullname (t3_xxx)
  - `direction`(optional): type: string; default: 'up'; Vote direction: up, down, none
- Usage: `opencli reddit upvote [options] -f json`

### upvoted
- Purpose: Browse your upvoted Reddit posts
- Args:
  - `limit`(optional): type: int; default: 15
- Usage: `opencli reddit upvoted [options] -f json`

### user
- Purpose: View a Reddit user profile
- Args:
  - `username`(required): type: string
- Usage: `opencli reddit user [options] -f json`

### user-comments
- Purpose: View a Reddit user's comment history
- Args:
  - `username`(required): type: string
  - `limit`(optional): type: int; default: 15
- Usage: `opencli reddit user-comments [options] -f json`

### user-posts
- Purpose: View a Reddit user's submitted posts
- Args:
  - `username`(required): type: string
  - `limit`(optional): type: int; default: 15
- Usage: `opencli reddit user-posts [options] -f json`
