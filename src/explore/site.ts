/**
 * Site name detection and URL slug utilities.
 */

const KNOWN_SITE_ALIASES: Record<string, string> = {
  'x.com': 'twitter', 'twitter.com': 'twitter',
  'news.ycombinator.com': 'hackernews',
  'www.zhihu.com': 'zhihu', 'www.bilibili.com': 'bilibili',
  'search.bilibili.com': 'bilibili',
  'www.v2ex.com': 'v2ex', 'www.reddit.com': 'reddit',
  'www.xiaohongshu.com': 'xiaohongshu', 'www.douban.com': 'douban',
  'www.weibo.com': 'weibo', 'www.bbc.com': 'bbc',
};

export function detectSiteName(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host in KNOWN_SITE_ALIASES) return KNOWN_SITE_ALIASES[host];
    const parts = host.split('.').filter(p => p && p !== 'www');
    if (parts.length >= 2) {
      if (['uk', 'jp', 'cn', 'com'].includes(parts[parts.length - 1]) && parts.length >= 3) {
        return slugify(parts[parts.length - 3]);
      }
      return slugify(parts[parts.length - 2]);
    }
    return parts[0] ? slugify(parts[0]) : 'site';
  } catch { return 'site'; }
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
}
