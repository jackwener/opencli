# Pixiv

**Mode**: 🔐 Browser · **Domain**: `www.pixiv.net`

## Commands

| Command | Description |
|---------|-------------|
| `opencli pixiv ranking` | Daily/weekly/monthly illustration rankings |
| `opencli pixiv search <query>` | Search illustrations by keyword or tag |
| `opencli pixiv user <uid>` | View artist profile info |
| `opencli pixiv illusts <user-id>` | List illustrations by artist |
| `opencli pixiv detail <id>` | View illustration details |
| `opencli pixiv download <illust-id>` | Download original-quality images |

## Usage Examples

```bash
# Browse daily rankings
opencli pixiv ranking --limit 10

# Weekly rankings
opencli pixiv ranking --mode weekly

# Search by tag
opencli pixiv search "初音ミク" --limit 20

# View artist profile
opencli pixiv user 11

# List artist's illustrations
opencli pixiv illusts 11 --limit 10

# View illustration details
opencli pixiv detail 12345678

# Download all images from an illustration
opencli pixiv download 12345678

# Download to a custom directory
opencli pixiv download 12345678 --output ./my-images

# JSON output
opencli pixiv ranking -f json
```

## Prerequisites

- Chrome running and **logged into** pixiv.net
- [Browser Bridge extension](/guide/browser-bridge) installed
