# douban

## Commands

### book-hot
- Purpose: Douban books hot list
- Args:
  - `limit`(optional): type: int; default: 20; Number of books to return
- Usage: `opencli douban book-hot [options] -f json`

### marks
- Purpose: Export personal movie marks
- Args:
  - `status`(optional): default: 'collect'; Mark type: collect (watched), wish (want to watch), do (watching), all (all)
  - `limit`(optional): type: int; default: 50; Export count, 0 means all
  - `uid`(optional): User ID; uses current logged-in user if omitted
- Usage: `opencli douban marks [options] -f json`

### movie-hot
- Purpose: Douban movies hot list
- Args:
  - `limit`(optional): type: int; default: 20; Number of movies to return
- Usage: `opencli douban movie-hot [options] -f json`

### reviews
- Purpose: Export personal movie reviews
- Args:
  - `limit`(optional): type: int; default: 20; Export count
  - `uid`(optional): User ID; uses current logged-in user if omitted
  - `full`(optional): type: bool; default: false; Get full review content
- Usage: `opencli douban reviews [options] -f json`

### search
- Purpose: Search Douban movies, books, or music
- Args:
  - `type`(optional): default: 'movie'; Search type (movie, book, music)
  - `keyword`(required): Search keyword
  - `limit`(optional): type: int; default: 20; Number of results to return
- Usage: `opencli douban search [options] -f json`

### subject
- Purpose: Get movie detail
- Args:
  - `id`(required): type: str; Movie ID
- Usage: `opencli douban subject [options] -f json`

### top250
- Purpose: Douban Top 250 movies
- Args:
  - `limit`(optional): type: int; default: 250; Number of results to return
- Usage: `opencli douban top250 [options] -f json`
