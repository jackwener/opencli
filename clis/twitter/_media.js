/**
 * Twitter media extractor — pulls photo / video / animated_gif URLs out of the
 * GraphQL legacy payload that `extractTweet` already has in scope.
 *
 * Source preference:
 *   1. legacy.extended_entities.media[] — authoritative, includes videos/gifs and
 *      multi-image arrays in full.
 *   2. legacy.entities.media[]          — fallback, photos only, often partial.
 *
 * Output shape (stable; mirrored by ml-scout types):
 *   { type: 'photo' | 'video' | 'animated_gif', url: string, poster?: string }
 *
 * - photo: url normalized to `<media_url_https>?format=jpg&name=large` (matches
 *   download.js convention; consumers can swap `name=large` → `name=orig` for
 *   max resolution on click).
 * - video / animated_gif: url is the best mp4 variant from video_info.variants
 *   (highest bitrate, content_type=video/mp4); poster is media_url_https.
 *
 * Returns undefined when no media is present, so JSON output stays compact for
 * text-only tweets (no `media: []` noise).
 */

function pickPhotoUrl(m) {
    const base = m.media_url_https || m.media_url || '';
    if (!base) return null;
    if (base.includes('?format=')) {
        return base.replace(/&name=\w+$/, '') + '&name=large';
    }
    // pbs.twimg.com/media/<id>.jpg  →  ...?format=jpg&name=large
    const dot = base.lastIndexOf('.');
    const slash = base.lastIndexOf('/');
    if (dot > slash) {
        const ext = base.slice(dot + 1);
        return `${base.slice(0, dot)}?format=${ext}&name=large`;
    }
    return base;
}

function pickVideoUrl(m) {
    const variants = m.video_info?.variants || [];
    const mp4s = variants.filter(v => v.content_type === 'video/mp4');
    if (mp4s.length === 0) {
        // Some animated_gif variants only carry a single non-mp4 entry; take the first.
        return variants[0]?.url || null;
    }
    let best = mp4s[0];
    for (const v of mp4s) {
        if ((v.bitrate || 0) > (best.bitrate || 0)) best = v;
    }
    return best.url || null;
}

function normalizeOne(m) {
    if (!m || typeof m !== 'object') return null;
    const type = m.type;
    if (type === 'photo') {
        const url = pickPhotoUrl(m);
        return url ? { type: 'photo', url } : null;
    }
    if (type === 'video' || type === 'animated_gif') {
        const url = pickVideoUrl(m);
        if (!url) return null;
        const poster = m.media_url_https || m.media_url || undefined;
        return poster ? { type, url, poster } : { type, url };
    }
    return null;
}

/**
 * Extract media from a tweet's legacy object.
 * @param {object} legacy - tweet.legacy (the same `l` already in scope in extractors)
 * @returns {Array<{type:string,url:string,poster?:string}>|undefined}
 */
export function extractMedia(legacy) {
    if (!legacy || typeof legacy !== 'object') return undefined;
    const arr = legacy.extended_entities?.media || legacy.entities?.media || [];
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    const out = [];
    for (const m of arr) {
        const norm = normalizeOne(m);
        if (norm) out.push(norm);
    }
    return out.length > 0 ? out : undefined;
}
