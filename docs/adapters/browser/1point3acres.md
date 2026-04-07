# 1Point3Acres

**Mode**: 🔐 Browser · **Domain**: `1point3acres.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli 1point3acres hot` | Hot forum topics |
| `opencli 1point3acres threads` | Hot thread list from the public API |
| `opencli 1point3acres forums` | Public forum list |
| `opencli 1point3acres posts <tid>` | Thread posts (auth required) |
| `opencli 1point3acres search <query>` | Search threads (auth required) |

## Usage Examples

```bash
# Hot topics
opencli 1point3acres hot --limit 10

# Equivalent public API thread list
opencli 1point3acres threads --limit 10 --page 1

# List forum IDs and names
opencli 1point3acres forums

# Read thread posts (requires login)
opencli 1point3acres posts 1171864 --limit 20

# Search (requires login)
opencli 1point3acres search "USC CS"

# JSON output
opencli 1point3acres hot --limit 10 -f json
```

## Prerequisites

- `hot`, `threads`, and `forums`: no browser or login required.
- `posts` and `search`: Chrome running with the [Browser Bridge extension](/guide/browser-bridge) installed and logged into `1point3acres.com`.

## Notes

- Public commands use `https://api.1point3acres.com/api/forums` and `https://api.1point3acres.com/api/threads`.
- `posts` uses `POST https://api.1point3acres.com/api/threads/<tid>/posts`.
- `search` uses `GET https://api.1point3acres.com/api/search`.
- The `fid` parameter on `threads` is not exposed because the upstream API currently ignores it.
