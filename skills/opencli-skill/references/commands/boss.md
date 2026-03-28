# boss

## Commands

### batchgreet
- Purpose: Send batch greetings to recommended candidates on BOSS Zhipin
- Args:
  - `job-id`(optional): default: ''; Filter by encrypted job ID (greet all jobs if empty)
  - `limit`(optional): type: int; default: 5; Max candidates to greet
  - `text`(optional): default: ''; Custom greeting message (uses default if empty)
- Usage: `opencli boss batchgreet [options] -f json`

### chatlist
- Purpose: View recruiter chat list on BOSS Zhipin
- Args:
  - `page`(optional): type: int; default: 1; Page number
  - `limit`(optional): type: int; default: 20; Number of results
  - `job-id`(optional): default: '0'; Filter by job ID (0=all)
- Usage: `opencli boss chatlist [options] -f json`

### chatmsg
- Purpose: View chat messages with a candidate on BOSS Zhipin
- Args:
  - `uid`(required): Encrypted UID (from chatlist)
  - `page`(optional): type: int; default: 1; Page number
- Usage: `opencli boss chatmsg [options] -f json`

### detail
- Purpose: View job detail on BOSS Zhipin
- Args:
  - `security-id`(required): Security ID from search results (securityId field)
- Usage: `opencli boss detail [options] -f json`

### exchange
- Purpose: Request contact exchange (phone/WeChat) on BOSS Zhipin
- Args:
  - `uid`(required): Encrypted UID of the candidate
  - `type`(optional): default: 'phone'; Exchange type: phone or wechat
- Usage: `opencli boss exchange [options] -f json`

### greet
- Purpose: Send greeting to a new candidate (start chat) on BOSS Zhipin
- Args:
  - `uid`(required): Encrypted UID of the candidate (from recommend)
  - `security-id`(required): Security ID of the candidate
  - `job-id`(required): Encrypted job ID
  - `text`(optional): default: ''; Custom greeting message (uses default template if empty)
- Usage: `opencli boss greet [options] -f json`

### invite
- Purpose: Send interview invitation on BOSS Zhipin
- Args:
  - `uid`(required): Encrypted UID of the candidate
  - `time`(required): Interview time (e.g. 2025-04-01 14:00)
  - `address`(optional): default: ''; Interview address (uses saved address if empty)
  - `contact`(optional): default: ''; Contact person name (uses saved contact if empty)
- Usage: `opencli boss invite [options] -f json`

### joblist
- Purpose: View my posted jobs on BOSS Zhipin
- Args: None
- Usage: `opencli boss joblist [options] -f json`

### mark
- Purpose: Add labels to a candidate on BOSS Zhipin
- Args:
  - `uid`(required): Encrypted UID of the candidate
  - `label`(required): Label name (new-greet/in-chat/interview-scheduled/resume-received/phone-exchanged/wechat-exchanged/not-fit/favorite) or label ID
  - `remove`(optional): type: boolean; default: false; Remove the label instead of adding
- Usage: `opencli boss mark [options] -f json`

### recommend
- Purpose: View recommended candidates (new greetings list) on BOSS Zhipin
- Args:
  - `limit`(optional): type: int; default: 20; Number of results to return
- Usage: `opencli boss recommend [options] -f json`

### resume
- Purpose: View candidate resume on BOSS Zhipin (recruiter side)
- Args:
  - `uid`(required): Encrypted UID of the candidate (from chatlist)
- Usage: `opencli boss resume [options] -f json`

### search
- Purpose: Search jobs on BOSS Zhipin
- Args:
  - `query`(required): Search keyword (e.g. AI agent, frontend)
  - `city`(optional): default: 'Beijing'; City name or code (e.g. Hangzhou, Shanghai, 101010100)
  - `experience`(optional): default: ''; Experience: new-grad/lt-1y/1-3y/3-5y/5-10y/10y+
  - `degree`(optional): default: ''; Degree: associate/bachelor/master/phd
  - `salary`(optional): default: ''; Salary: lt-3K/3-5K/5-10K/10-15K/15-20K/20-30K/30-50K/gt-50K
  - `industry`(optional): default: ''; Industry code or name (e.g. 100020, internet)
  - `page`(optional): type: int; default: 1; Page number
  - `limit`(optional): type: int; default: 15; Number of results
- Usage: `opencli boss search [options] -f json`

### send
- Purpose: Send chat message on BOSS Zhipin
- Args:
  - `uid`(required): Encrypted UID of the candidate (from chatlist)
  - `text`(required): Message text to send
- Usage: `opencli boss send [options] -f json`

### stats
- Purpose: Job stats on BOSS Zhipin
- Args:
  - `job-id`(optional): default: ''; Encrypted job ID (show all if empty)
- Usage: `opencli boss stats [options] -f json`
