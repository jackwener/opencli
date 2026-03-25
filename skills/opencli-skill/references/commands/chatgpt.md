# chatgpt

## Commands

### ask
- Purpose: Send a prompt and wait for the AI response (send + wait + read)
- Args:
  - `text`(required): Prompt to send
  - `timeout`(optional): default: 30; Max seconds to wait for response (default: 30)
- Usage: `opencli chatgpt ask [options] -f json`

### new
- Purpose: Open a new chat in ChatGPT Desktop App
- Args: None
- Usage: `opencli chatgpt new [options] -f json`

### read
- Purpose: Read the last visible message from the focused ChatGPT Desktop window
- Args: None
- Usage: `opencli chatgpt read [options] -f json`

### send
- Purpose: Send a message to the active ChatGPT Desktop App window
- Args:
  - `text`(required): Message to send
- Usage: `opencli chatgpt send [options] -f json`

### status
- Purpose: Check if ChatGPT Desktop App is running natively on macOS
- Args: None
- Usage: `opencli chatgpt status [options] -f json`
