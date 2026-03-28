# hf

## Commands

### top
- Purpose: Top upvoted Hugging Face papers
- Args:
  - `limit`(optional): type: int; default: 20; Number of papers
  - `all`(optional): type: bool; default: false; Return all papers (ignore limit)
  - `date`(optional): type: str; Date (YYYY-MM-DD), defaults to most recent
  - `period`(optional): type: str; default: 'daily'; Time period: daily, weekly, or monthly
- Usage: `opencli hf top [options] -f json`
