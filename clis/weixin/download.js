/**
 * WeChat article download — export WeChat Official Account articles to Markdown.
 *
 * Ported from jackwener/wechat-article-to-markdown (JS version) to OpenCLI adapter.
 *
 * Usage:
 *   opencli weixin download --url "https://mp.weixin.qq.com/s/xxx" --output ./weixin
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { TimeoutError } from '@jackwener/opencli/errors';
import { downloadArticle } from '@jackwener/opencli/download/article-download';
// ============================================================
// URL Normalization
// ============================================================
/**
 * Normalize a pasted WeChat article URL.
 */
// Wrapping quote characters to strip from a pasted URL. Covers ASCII plus
// CJK typographic / smart quotes, which are common when users copy URLs from
// Chinese-language environments (WeChat itself, macOS smart-quote
// substitution, Word / Pages, …).
//
// Pairs:
//   "  "         ASCII straight double
//   '  '         ASCII straight single
//   “  ”         curly double (U+201C / U+201D)
//   ‘  ’         curly single (U+2018 / U+2019)
//   「  」         CJK corner brackets (U+300C / U+300D)
//   『  』         CJK white corner brackets (U+300E / U+300F)
//   „  ‟         German-style double quotes (U+201E / U+201F)
//   ‹  ›         single guillemets (U+2039 / U+203A)
//   «  »         double guillemets (U+00AB / U+00BB)
const WRAPPING_QUOTE_PAIRS = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
    ['「', '」'],
    ['『', '』'],
    ['„', '‟'],
    ['‹', '›'],
    ['«', '»'],
];
const LEADING_WRAP_CHARS = new Set(WRAPPING_QUOTE_PAIRS.map(([open]) => open).concat('<'));
const TRAILING_WRAP_CHARS = new Set(WRAPPING_QUOTE_PAIRS.map(([, close]) => close).concat('>'));

function stripBoundaryWrapChars(value) {
    let s = value;
    for (let i = 0; i < 4; i += 1) {
        const before = s;
        for (const [open, close] of WRAPPING_QUOTE_PAIRS) {
            if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
                s = s.slice(open.length, s.length - close.length).trim();
                break;
            }
        }
        while (s && LEADING_WRAP_CHARS.has(s[0])) {
            s = s.slice(1).trimStart();
        }
        while (s && TRAILING_WRAP_CHARS.has(s[s.length - 1])) {
            s = s.slice(0, -1).trimEnd();
        }
        if (s === before)
            break;
    }
    return s;
}

export function normalizeWechatUrl(raw) {
    let s = (raw || '').trim();
    if (!s)
        return s;
    // Strip quote / angle-bracket characters only at the pasted boundary. This
    // handles both paired wrappers ("<url>", "“url”") and common one-sided
    // trailing punctuation ("url”") without touching encoded URL content.
    s = stripBoundaryWrapChars(s);
    // Remove backslash escapes before URL-significant characters
    s = s.replace(/\\+([:/&?=#%])/g, '$1');
    // Decode HTML entities
    s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    // Allow bare hostnames
    if (s.startsWith('mp.weixin.qq.com/') || s.startsWith('//mp.weixin.qq.com/')) {
        s = 'https://' + s.replace(/^\/+/, '');
    }
    // Force https for mp.weixin.qq.com
    try {
        const parsed = new URL(s);
        if (['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.toLowerCase() === 'mp.weixin.qq.com') {
            parsed.protocol = 'https:';
            s = parsed.toString();
        }
    }
    catch {
        // Ignore parse errors
    }
    return s;
}
/**
 * Format a WeChat article timestamp as a UTC+8 datetime string.
 * Accepts either Unix seconds or milliseconds.
 */
export function formatWechatTimestamp(rawTimestamp) {
    const ts = Number.parseInt(rawTimestamp, 10);
    if (!Number.isFinite(ts) || ts <= 0)
        return '';
    const timestampMs = rawTimestamp.length === 13 ? ts : ts * 1000;
    const d = new Date(timestampMs);
    const pad = (n) => String(n).padStart(2, '0');
    const utc8 = new Date(d.getTime() + 8 * 3600 * 1000);
    return (`${utc8.getUTCFullYear()}-` +
        `${pad(utc8.getUTCMonth() + 1)}-` +
        `${pad(utc8.getUTCDate())} ` +
        `${pad(utc8.getUTCHours())}:` +
        `${pad(utc8.getUTCMinutes())}:` +
        `${pad(utc8.getUTCSeconds())}`);
}
/**
 * Extract the raw create_time value from supported WeChat inline script formats.
 */
export function extractWechatCreateTimeValue(htmlStr) {
    const jsDecodeMatch = htmlStr.match(/create_time\s*:\s*JsDecode\('([^']+)'\)(?=[\s,;}]|$)/);
    if (jsDecodeMatch)
        return jsDecodeMatch[1];
    const directValueMatch = htmlStr.match(/create_time\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([0-9A-Za-z]+))(?=[\s,;}]|$)/);
    if (!directValueMatch)
        return '';
    return directValueMatch[1] || directValueMatch[2] || directValueMatch[3] || '';
}
/**
 * Extract the publish time from DOM text first, then fall back to numeric create_time values.
 */
export function extractWechatPublishTime(publishTimeText, htmlStr) {
    const normalizedPublishTime = (publishTimeText || '').trim();
    if (normalizedPublishTime)
        return normalizedPublishTime;
    const rawCreateTime = extractWechatCreateTimeValue(htmlStr);
    if (!/^\d{10}$|^\d{13}$/.test(rawCreateTime))
        return '';
    return formatWechatTimestamp(rawCreateTime);
}
/**
 * Detect WeChat anti-bot / verification gate pages before we try to parse the article.
 */
export function detectWechatAccessIssue(pageText, htmlStr, hasArticle = false) {
    if (hasArticle) return '';
    const text = (pageText || '').replace(/\s+/g, ' ').trim();
    // Only explicit interaction prompts stop the wait early. A redirect URL
    // or an opaque iframe alone does not tell us whether the page will advance.
    if (/id=["']js_verify["']/.test(htmlStr || '') ||
        (/(环境异常|安全验证)/.test(text) &&
            /(完成验证后即可继续访问|去验证|请拖动物体完成验证|拖动.*完成验证)/.test(text))) {
        return 'environment verification required';
    }
    return '';
}
export function pickFirstWechatMetaText(...candidates) {
    for (const candidate of candidates) {
        const normalized = (candidate || '').replace(/\s+/g, ' ').trim();
        if (normalized && normalized !== 'Name cleared')
            return normalized;
    }
    return '';
}
/**
 * Build a self-contained helper for execution inside page.evaluate().
 */
export function buildExtractWechatPublishTimeJs() {
    return `(${function extractWechatPublishTimeInPage(publishTimeText, htmlStr) {
        function formatWechatTimestamp(rawTimestamp) {
            const ts = Number.parseInt(rawTimestamp, 10);
            if (!Number.isFinite(ts) || ts <= 0)
                return '';
            const timestampMs = rawTimestamp.length === 13 ? ts : ts * 1000;
            const d = new Date(timestampMs);
            const pad = (n) => String(n).padStart(2, '0');
            const utc8 = new Date(d.getTime() + 8 * 3600 * 1000);
            return (`${utc8.getUTCFullYear()}-` +
                `${pad(utc8.getUTCMonth() + 1)}-` +
                `${pad(utc8.getUTCDate())} ` +
                `${pad(utc8.getUTCHours())}:` +
                `${pad(utc8.getUTCMinutes())}:` +
                `${pad(utc8.getUTCSeconds())}`);
        }
        function extractWechatCreateTimeValue(html) {
            const jsDecodeMatch = html.match(/create_time\s*:\s*JsDecode\('([^']+)'\)(?=[\s,;}]|$)/);
            if (jsDecodeMatch)
                return jsDecodeMatch[1];
            const directValueMatch = html.match(/create_time\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([0-9A-Za-z]+))(?=[\s,;}]|$)/);
            if (!directValueMatch)
                return '';
            return directValueMatch[1] || directValueMatch[2] || directValueMatch[3] || '';
        }
        const normalizedPublishTime = (publishTimeText || '').trim();
        if (normalizedPublishTime)
            return normalizedPublishTime;
        const rawCreateTime = extractWechatCreateTimeValue(htmlStr);
        if (!/^\d{10}$|^\d{13}$/.test(rawCreateTime))
            return '';
        return formatWechatTimestamp(rawCreateTime);
    }.toString()})`;
}
/**
 * Build a self-contained access-issue detector for execution inside page.evaluate().
 */
export function buildDetectWechatAccessIssueJs() {
    // Keep the browser and directly-tested detector identical. The detector
    // must stay self-contained because it runs without this module's scope.
    return `(${detectWechatAccessIssue.toString()})`;
}
export function buildWechatArticleSnapshotJs() {
    return `
      (() => {
        const result = {
          ready: false,
          title: '',
          author: '',
          publishTime: '',
          errorHint: '',
          contentHtml: '',
          codeBlocks: [],
          imageUrls: []
        };

        const pickFirstText = (...selectors) => {
          for (const selector of selectors) {
            const text = document.querySelector(selector)?.textContent?.replace(/\\s+/g, ' ').trim() || '';
            if (text && text !== 'Name cleared') return text;
          }
          return '';
        };

        // WeChat has multiple article templates. Newer pages use #js_text_title.
        result.title = pickFirstText(
          '#activity-name',
          '#js_text_title',
          '.rich_media_title',
        );

        // Inspect a clone: polling must not rewrite the live page or consume
        // code blocks before the article is ready.
        const contentEl = document.querySelector('#js_content')?.cloneNode(true);
        contentEl?.querySelectorAll('script, style').forEach(el => el.remove());
        const hasContent = Boolean(contentEl && (
          contentEl.textContent?.trim() ||
          contentEl.querySelector('img[src], img[data-src], video, audio, iframe[src], iframe[data-src]')
        ));
        const articleLocation = window.location.hostname === 'mp.weixin.qq.com' &&
          /^\\/s(?:\\/|$)/.test(window.location.pathname);
        const detectWechatAccessIssue = ${buildDetectWechatAccessIssueJs()};
        result.errorHint = detectWechatAccessIssue(
          document.body ? document.body.innerText : '',
          document.documentElement.innerHTML,
          hasContent,
        );
        if (result.errorHint || !result.title || !hasContent || !articleLocation ||
            document.readyState === 'loading') return result;
        result.ready = true;

        result.author = pickFirstText(
          '#js_name',
          '.wx_follow_nickname',
          '#profileBt .profile_nickname',
          '.rich_media_meta.rich_media_meta_nickname',
          '.rich_media_meta_nickname',
        );

        // Publish time: prefer the rendered DOM text, then fall back to numeric create_time values.
        const publishTimeEl = document.querySelector('#publish_time');
        const extractWechatPublishTime = ${buildExtractWechatPublishTimeJs()};
        result.publishTime = extractWechatPublishTime(
          publishTimeEl ? publishTimeEl.textContent : '',
          document.documentElement.innerHTML,
        );

        // Fix lazy-loaded images: data-src -> src
        contentEl.querySelectorAll('img').forEach(img => {
          const dataSrc = img.getAttribute('data-src');
          if (dataSrc) img.setAttribute('src', dataSrc);
        });

        // Extract code blocks with placeholder replacement
        const codeBlocks = [];
        contentEl.querySelectorAll('.code-snippet__fix').forEach(el => {
          el.querySelectorAll('.code-snippet__line-index').forEach(li => li.remove());
          const pre = el.querySelector('pre[data-lang]');
          const lang = pre ? (pre.getAttribute('data-lang') || '') : '';
          const lines = [];
          el.querySelectorAll('code').forEach(codeTag => {
            const text = codeTag.textContent;
            if (/^[ce]?ounter\\(line/.test(text)) return;
            lines.push(text);
          });
          if (lines.length === 0) lines.push(el.textContent);
          const placeholder = 'CODEBLOCK-PLACEHOLDER-' + codeBlocks.length;
          codeBlocks.push({ lang, code: lines.join('\\n') });
          const p = document.createElement('p');
          p.textContent = placeholder;
          el.replaceWith(p);
        });
        result.codeBlocks = codeBlocks;

        // Remove noise elements
        ['script', 'style', '.qr_code_pc', '.reward_area'].forEach(sel => {
          contentEl.querySelectorAll(sel).forEach(tag => tag.remove());
        });

        // Collect image URLs (deduplicated)
        const seen = new Set();
        contentEl.querySelectorAll('img[src]').forEach(img => {
          const src = img.getAttribute('src');
          if (src && !seen.has(src)) {
            seen.add(src);
            result.imageUrls.push(src);
          }
        });

        result.contentHtml = contentEl.innerHTML;
        return result;
      })()
    `;
}

/** Observe the same tab until content is extractable. Browser requests retain
 * their transport timeout; the readiness budget starts after navigation.
 */
export async function waitForWechatArticle(page, { timeoutMs = 15000, pollIntervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const script = buildWechatArticleSnapshotJs();
    while (Date.now() < deadline) {
        const snapshot = await page.evaluate(script);
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        if (snapshot?.errorHint || snapshot?.ready) return snapshot;
        await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
    }
    throw new TimeoutError(
        'WeChat article readiness', timeoutMs / 1000,
        'The page did not expose a title and article content. Inspect it for loading or access restrictions.',
    );
}
// ============================================================
// CLI Registration
// ============================================================
cli({
    site: 'weixin',
    name: 'download',
    access: 'read',
    description: '下载微信公众号文章为 Markdown 格式',
    domain: 'mp.weixin.qq.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false,
    args: [
        { name: 'url', required: true, help: 'WeChat article URL (mp.weixin.qq.com/s/xxx)' },
        { name: 'output', default: './weixin-articles', help: 'Output directory' },
        { name: 'download-images', type: 'boolean', default: true, help: 'Download images locally' },
    ],
    columns: ['title', 'author', 'publish_time', 'status', 'size', 'saved'],
    func: async (page, kwargs) => {
        const rawUrl = kwargs.url;
        const url = normalizeWechatUrl(rawUrl);
        if (!url.startsWith('https://mp.weixin.qq.com/')) {
            return [{ title: 'Error', author: '-', publish_time: '-', status: 'invalid URL', size: '-', saved: '-' }];
        }
        // Navigate and wait for content to load
        await page.goto(url);
        // Extract article data in browser context
        const data = await waitForWechatArticle(page);
        if (data?.errorHint === 'environment verification required') {
            return [{
                    title: 'Error',
                    author: '-',
                    publish_time: '-',
                    status: 'failed — verification required in WeChat browser page',
                    size: '-',
                    saved: '-',
                }];
        }
        return downloadArticle({
            title: data?.title || '',
            author: data?.author,
            publishTime: data?.publishTime,
            sourceUrl: url,
            contentHtml: data?.contentHtml || '',
            codeBlocks: data?.codeBlocks,
            imageUrls: data?.imageUrls,
        }, {
            output: kwargs.output,
            downloadImages: kwargs['download-images'],
            imageHeaders: { Referer: 'https://mp.weixin.qq.com/' },
            frontmatterLabels: { author: '公众号' },
            detectImageExt: (url) => {
                const m = url.match(/wx_fmt=(\w+)/) || url.match(/\.(\w{3,4})(?:\?|$)/);
                return m ? m[1] : 'png';
            },
        });
    },
});
