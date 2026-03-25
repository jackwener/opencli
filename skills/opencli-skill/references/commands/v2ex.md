# v2ex

## Commands

### daily
- Purpose: V2EX daily check-in and claim coins
- Args: None
- Usage: `opencli v2ex daily [options] -f json`

### hot
- Purpose: V2EX hot topics
- Args:
  - `limit`(optional): type: int; default: 20; Number of topics
- Usage: `opencli v2ex hot [options] -f json`

### latest
- Purpose: V2EX latest topics
- Args:
  - `limit`(optional): type: int; default: 20; Number of topics
- Usage: `opencli v2ex latest [options] -f json`

### me
- Purpose: V2EX my profile (balance/unread notifications)
- Args: None
- Usage: `opencli v2ex me [options] -f json`

### member
- Purpose: V2EX user profile
- Args:
  - `username`(required): type: str; Username
- Usage: `opencli v2ex member [options] -f json`

### node
- Purpose: V2EX node topics
- Args:
  - `name`(required): type: str; Node name (e.g. python, javascript, apple)
  - `limit`(optional): type: int; default: 10; Number of topics (API returns max 20)
- Usage: `opencli v2ex node [options] -f json`

### nodes
- Purpose: V2EX all nodes
- Args:
  - `limit`(optional): type: int; default: 30; Number of nodes
- Usage: `opencli v2ex nodes [options] -f json`

### notifications
- Purpose: V2EX notifications (replies/mentions)
- Args:
  - `limit`(optional): type: int; default: 20; Number of notifications
- Usage: `opencli v2ex notifications [options] -f json`

### replies
- Purpose: V2EX topic replies
- Args:
  - `id`(required): type: str; Topic ID
  - `limit`(optional): type: int; default: 20; Number of replies
- Usage: `opencli v2ex replies [options] -f json`

### topic
- Purpose: V2EX topic detail with replies
- Args:
  - `id`(required): type: str; Topic ID
- Usage: `opencli v2ex topic [options] -f json`

### user
- Purpose: V2EX user topics
- Args:
  - `username`(required): type: str; Username
  - `limit`(optional): type: int; default: 10; Number of topics (API returns max 20)
- Usage: `opencli v2ex user [options] -f json`
