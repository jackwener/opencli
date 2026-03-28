# doubao

## Commands

### ask
- Purpose: Send a prompt and wait for the Doubao response
- Args:
  - `text`(required): Prompt to send
  - `timeout`(optional): default: 60; Max seconds to wait (default: 60)
- Usage: `opencli doubao ask [options] -f json`

### new
- Purpose: Start a new conversation in Doubao web chat
- Args: None
- Usage: `opencli doubao new [options] -f json`

### read
- Purpose: Read the current Doubao conversation history
- Args: None
- Usage: `opencli doubao read [options] -f json`

### send
- Purpose: Send a message to Doubao web chat
- Args:
  - `text`(required): Message to send
- Usage: `opencli doubao send [options] -f json`

### status
- Purpose: Check Doubao chat page availability and login state
- Args: None
- Usage: `opencli doubao status [options] -f json`
