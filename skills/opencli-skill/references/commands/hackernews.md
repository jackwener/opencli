# hackernews

## Commands

### ask
- Purpose: Hacker News Ask HN posts
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli hackernews ask [options] -f json`

### best
- Purpose: Hacker News best stories
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli hackernews best [options] -f json`

### jobs
- Purpose: Hacker News job postings
- Args:
  - `limit`(optional): type: int; default: 20; Number of job postings
- Usage: `opencli hackernews jobs [options] -f json`

### new
- Purpose: Hacker News newest stories
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli hackernews new [options] -f json`

### search
- Purpose: Search Hacker News stories
- Args:
  - `query`(required): type: str; Search query
  - `limit`(optional): type: int; default: 20; Number of results
  - `sort`(optional): type: str; default: relevance; Sort by relevance or date
- Usage: `opencli hackernews search [options] -f json`

### show
- Purpose: Hacker News Show HN posts
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli hackernews show [options] -f json`

### top
- Purpose: Hacker News top stories
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli hackernews top [options] -f json`

### user
- Purpose: Hacker News user profile
- Args:
  - `username`(required): type: str; HN username
- Usage: `opencli hackernews user [options] -f json`
