# lobsters

## Commands

### active
- Purpose: Lobste.rs most active discussions
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli lobsters active [options] -f json`

### hot
- Purpose: Lobste.rs hottest stories
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli lobsters hot [options] -f json`

### newest
- Purpose: Lobste.rs newest stories
- Args:
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli lobsters newest [options] -f json`

### tag
- Purpose: Lobste.rs stories by tag
- Args:
  - `tag`(required): type: str; "Tag name (e.g. programming, rust, security, ai)"
  - `limit`(optional): type: int; default: 20; Number of stories
- Usage: `opencli lobsters tag [options] -f json`
