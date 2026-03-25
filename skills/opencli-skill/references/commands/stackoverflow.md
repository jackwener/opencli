# stackoverflow

## Commands

### bounties
- Purpose: Active bounties on Stack Overflow
- Args:
  - `limit`(optional): type: int; default: 10; Max number of results
- Usage: `opencli stackoverflow bounties [options] -f json`

### hot
- Purpose: Hot Stack Overflow questions
- Args:
  - `limit`(optional): type: int; default: 10; Max number of results
- Usage: `opencli stackoverflow hot [options] -f json`

### search
- Purpose: Search Stack Overflow questions
- Args:
  - `query`(required): type: string; Search query
  - `limit`(optional): type: int; default: 10; Max number of results
- Usage: `opencli stackoverflow search [options] -f json`

### unanswered
- Purpose: Top voted unanswered questions on Stack Overflow
- Args:
  - `limit`(optional): type: int; default: 10; Max number of results
- Usage: `opencli stackoverflow unanswered [options] -f json`
