# Lobsters

**Mode**: 🌐 Public · **Domain**: `lobste.rs`

## Commands

| Command | Description |
|---------|-------------|
| `opencli lobsters hot` | Hottest stories |
| `opencli lobsters newest` | Latest stories |
| `opencli lobsters active` | Most active discussions |
| `opencli lobsters tag <tag>` | Stories by tag |
| `opencli lobsters read <short_id>` | Read a story and its comment tree |

## Usage Examples

```bash
# Quick start
opencli lobsters hot --limit 10

# Filter by tag
opencli lobsters tag rust --limit 5

# Read a specific story (use the short_id surfaced as `id` in any listing)
opencli lobsters read 6cmh6h --limit 25 --depth 2

# JSON output
opencli lobsters hot -f json
```

## Output Columns

| Command | Columns |
|---------|---------|
| `hot` / `newest` / `active` / `tag` | `rank, id, title, score, author, comments, created_at, tags, url` |
| `read` | `type, author, score, text` (POST + L0/L1/… comments, with `[+N more replies]` stubs) |

`id` is the lobste.rs `short_id` — pipe it into `read` to drill into the discussion.

## Prerequisites

None — all commands use the public JSON API, no browser or login required.
