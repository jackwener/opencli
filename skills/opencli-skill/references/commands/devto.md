# devto

## Commands

### tag
- Purpose: Latest DEV.to articles for a specific tag
- Args:
  - `tag`(required): type: str; "Tag name (e.g. javascript, python, webdev)"
  - `limit`(optional): type: int; default: 20; Number of articles
- Usage: `opencli devto tag [options] -f json`

### top
- Purpose: Top DEV.to articles of the day
- Args:
  - `limit`(optional): type: int; default: 20; Number of articles
- Usage: `opencli devto top [options] -f json`

### user
- Purpose: Recent DEV.to articles from a specific user
- Args:
  - `username`(required): type: str; "DEV.to username (e.g. ben, thepracticaldev)"
  - `limit`(optional): type: int; default: 20; Number of articles
- Usage: `opencli devto user [options] -f json`
