/**
 * Xiaohongshu download — download images and videos from a note.
 *
 * Usage:
 *   opencli xiaohongshu download --note_id abc123 --output ./xhs
 */

import { cli, Strategy } from '../../registry.js';
import { formatCookieHeader } from '../../download/index.js';
import { downloadMedia } from '../../download/media-download.js';

interface XhsMediaItem {
  type: 'image' | 'video';
  url: string;
}

function isRealXhsVideoUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
    && /\.(mp4|m3u8)(?:[?#]|$)/i.test(url)
    && /(xhscdn|xiaohongshu|sns-video|video)/i.test(url);
}

function normalizeXhsMedia(media: XhsMediaItem[], performanceResources: string[] = []): XhsMediaItem[] {
  const fallbackVideos = performanceResources
    .filter((url) => isRealXhsVideoUrl(url))
    .filter((url, index, list) => list.indexOf(url) === index);

  let videoFallbackIndex = 0;

  return media.map((item) => {
    if (item.type !== 'video') return item;
    if (isRealXhsVideoUrl(item.url)) return item;

    const fallback = fallbackVideos[videoFallbackIndex];
    if (fallback) {
      videoFallbackIndex += 1;
      return { ...item, url: fallback };
    }

    return item;
  });
}

cli({
  site: 'xiaohongshu',
  name: 'download',
  description: '下载小红书笔记中的图片和视频',
  domain: 'www.xiaohongshu.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'note-id', positional: true, required: true, help: 'Note ID (from URL)' },
    { name: 'output', default: './xiaohongshu-downloads', help: 'Output directory' },
  ],
  columns: ['index', 'type', 'status', 'size'],
  func: async (page, kwargs) => {
    const noteId = kwargs['note-id'];
    const output = kwargs.output;

    // Navigate to note page
    await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);

    // Extract note info and media URLs
    const data = await page.evaluate(`
      (() => {
        const result = {
          noteId: '${noteId}',
          title: '',
          author: '',
          media: [],
          performanceResources: []
        };

        // Get title
        const titleEl = document.querySelector('.title, #detail-title, .note-content .title');
        result.title = titleEl?.textContent?.trim() || 'untitled';

        // Get author
        const authorEl = document.querySelector('.username, .author-name, .name');
        result.author = authorEl?.textContent?.trim() || 'unknown';

        // Get images - try multiple selectors
        const imageSelectors = [
          '.swiper-slide img',
          '.carousel-image img',
          '.note-slider img',
          '.note-image img',
          '.image-wrapper img',
          '#noteContainer .media-container img[src*="xhscdn"]',
          'img[src*="ci.xiaohongshu.com"]'
        ];

        const imageUrls = new Set();
        for (const selector of imageSelectors) {
          document.querySelectorAll(selector).forEach(img => {
            let src = img.src || img.getAttribute('data-src') || '';
            if (src && (src.includes('xhscdn') || src.includes('xiaohongshu'))) {
              // Convert to high quality URL (remove resize parameters)
              src = src.split('?')[0];
              src = src.replace(/\\/imageView\\d+\\/\\d+\\/w\\/\\d+/, '');
              imageUrls.add(src);
            }
          });
        }

        // Get video if exists
        const videoSelectors = [
          'video source',
          'video[src]',
          '.player video',
          '.video-player video'
        ];

        for (const selector of videoSelectors) {
          document.querySelectorAll(selector).forEach(v => {
            const src = v.currentSrc || v.src || v.getAttribute('src') || '';
            if (src) {
              result.media.push({ type: 'video', url: src });
            }
          });
        }

        // Add images to media
        imageUrls.forEach(url => {
          result.media.push({ type: 'image', url: url });
        });

        try {
          result.performanceResources = performance.getEntriesByType('resource')
            .map(entry => entry.name)
            .filter(url => /\\.(mp4|m3u8)(?:[?#]|$)/i.test(url) && /(xhscdn|xiaohongshu|sns-video|video)/i.test(url));
        } catch {}

        return result;
      })()
    `);

    if (!data || !data.media || data.media.length === 0) {
      return [{ index: 0, type: '-', status: 'failed', size: 'No media found' }];
    }

    const media = normalizeXhsMedia(
      Array.isArray(data.media) ? data.media as XhsMediaItem[] : [],
      Array.isArray((data as any).performanceResources) ? (data as any).performanceResources as string[] : [],
    );

    // Extract cookies for authenticated downloads
    const cookies = formatCookieHeader(await page.getCookies({ domain: 'xiaohongshu.com' }));

    return downloadMedia(media, {
      output,
      subdir: noteId,
      cookies,
      filenamePrefix: noteId,
      timeout: 60000,
    });
  },
});

export const __test__ = {
  normalizeXhsMedia,
  isRealXhsVideoUrl,
};
