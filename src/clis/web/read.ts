/**
 * Generic web page reader — fetch any URL and export as Markdown.
 *
 * Uses browser-side DOM heuristics to extract the main content:
 *   1. <article> element
 *   2. [role="main"] element
 *   3. <main> element
 *   4. Largest text-dense block as fallback
 *
 * Pipes through the shared article-download pipeline (Turndown + image download).
 *
 * Usage:
 *   opencli web read --url "https://www.anthropic.com/research/..." --output ./articles
 *   opencli web read --url "https://..." --download-images false
 */

import { cli, Strategy } from '../../registry.js';
import { downloadArticle } from '../../download/article-download.js';

cli({
  site: 'web',
  name: 'read',
  description: 'Fetch any web page and export as Markdown',
  strategy: Strategy.COOKIE,
  navigateBefore: false, // we handle navigation ourselves
  args: [
    { name: 'url', required: true, help: 'Any web page URL' },
    { name: 'output', default: './web-articles', help: 'Output directory' },
    { name: 'download-images', type: 'boolean', default: true, help: 'Download images locally' },
    { name: 'wait', type: 'int', default: 3, help: 'Seconds to wait after page load' },
  ],
  columns: ['title', 'author', 'publish_time', 'status', 'size'],
  func: async (page, kwargs) => {
    const url = kwargs.url;
    const waitSeconds = kwargs.wait ?? 3;

    // Navigate to the target URL
    await page.goto(url);
    await page.wait(waitSeconds);

    // Extract article content using browser-side heuristics
    const data = await page.evaluate(`
      (() => {
        const result = {
          title: '',
          author: '',
          publishTime: '',
          contentHtml: '',
          imageUrls: []
        };

        // --- Title extraction ---
        // Priority: og:title > <title> > first <h1>
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          result.title = ogTitle.getAttribute('content')?.trim() || '';
        }
        if (!result.title) {
          result.title = document.title?.trim() || '';
        }
        if (!result.title) {
          const h1 = document.querySelector('h1');
          result.title = h1?.textContent?.trim() || 'untitled';
        }
        // Strip site suffix (e.g. " | Anthropic", " - Blog")
        result.title = result.title.replace(/\\s*[|\\-–—]\\s*[^|\\-–—]{1,30}$/, '').trim();

        // --- Author extraction ---
        const authorMeta = document.querySelector(
          'meta[name="author"], meta[property="article:author"], meta[name="twitter:creator"]'
        );
        result.author = authorMeta?.getAttribute('content')?.trim() || '';

        // --- Publish time extraction ---
        const timeMeta = document.querySelector(
          'meta[property="article:published_time"], meta[name="date"], meta[name="publishdate"], time[datetime]'
        );
        if (timeMeta) {
          result.publishTime = timeMeta.getAttribute('content')
            || timeMeta.getAttribute('datetime')
            || timeMeta.textContent?.trim()
            || '';
        }

        // --- Content extraction ---
        // Strategy: try semantic elements first, then fall back to largest text block
        let contentEl = null;

        // 1. <article>
        const articles = document.querySelectorAll('article');
        if (articles.length === 1) {
          contentEl = articles[0];
        } else if (articles.length > 1) {
          // Pick the largest article by text length
          let maxLen = 0;
          articles.forEach(a => {
            const len = a.textContent?.length || 0;
            if (len > maxLen) { maxLen = len; contentEl = a; }
          });
        }

        // 2. [role="main"]
        if (!contentEl) {
          contentEl = document.querySelector('[role="main"]');
        }

        // 3. <main>
        if (!contentEl) {
          contentEl = document.querySelector('main');
        }

        // 4. Largest text-dense block fallback
        if (!contentEl) {
          const candidates = document.querySelectorAll(
            'div[class*="content"], div[class*="article"], div[class*="post"], ' +
            'div[class*="entry"], div[class*="body"], div[id*="content"], ' +
            'div[id*="article"], div[id*="post"], section'
          );
          let maxLen = 0;
          candidates.forEach(c => {
            const len = c.textContent?.length || 0;
            if (len > maxLen) { maxLen = len; contentEl = c; }
          });
        }

        // 5. Last resort: document.body
        if (!contentEl || (contentEl.textContent?.length || 0) < 200) {
          contentEl = document.body;
        }

        // Clean up noise elements before extraction
        const clone = contentEl.cloneNode(true);
        const noise = 'nav, header, footer, aside, .sidebar, .nav, .menu, .footer, ' +
          '.header, .comments, .comment, .ad, .ads, .advertisement, .social-share, ' +
          '.related-posts, .newsletter, .cookie-banner, script, style, noscript, iframe';
        clone.querySelectorAll(noise).forEach(el => el.remove());

        result.contentHtml = clone.innerHTML;

        // --- Image extraction ---
        const seen = new Set();
        clone.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('data-src')
            || img.getAttribute('data-original')
            || img.getAttribute('src');
          if (src && !src.startsWith('data:') && !seen.has(src)) {
            seen.add(src);
            result.imageUrls.push(src);
          }
        });

        return result;
      })()
    `);

    // Determine Referer from URL for image downloads
    let referer = '';
    try {
      const parsed = new URL(url);
      referer = parsed.origin + '/';
    } catch { /* ignore */ }

    return downloadArticle(
      {
        title: data?.title || 'untitled',
        author: data?.author,
        publishTime: data?.publishTime,
        sourceUrl: url,
        contentHtml: data?.contentHtml || '',
        imageUrls: data?.imageUrls,
      },
      {
        output: kwargs.output,
        downloadImages: kwargs['download-images'],
        imageHeaders: referer ? { Referer: referer } : undefined,
      },
    );
  },
});
