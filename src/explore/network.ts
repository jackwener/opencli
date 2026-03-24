/**
 * Network traffic parsing and URL pattern normalization.
 */

import { VOLATILE_PARAMS } from '../constants.js';
import type { NetworkEntry } from './types.js';

/**
 * Parse raw network output from the browser.
 * Handles text format: [GET] url => [200]
 * and structured array format from CDP/extension.
 */
export function parseNetworkRequests(raw: unknown): NetworkEntry[] {
  if (typeof raw === 'string') {
    const entries: NetworkEntry[] = [];
    for (const line of raw.split('\n')) {
      // Format: [GET] URL => [200]
      const m = line.match(/\[?(GET|POST|PUT|DELETE|PATCH|OPTIONS)\]?\s+(\S+)\s*(?:=>|→)\s*\[?(\d+)\]?/i);
      if (m) {
        const [, method, url, status] = m;
        entries.push({
          method: method.toUpperCase(), url, status: status ? parseInt(status) : null,
          contentType: (url.includes('/api/') || url.includes('/x/') || url.endsWith('.json')) ? 'application/json' : '',
        });
      }
    }
    return entries;
  }
  if (Array.isArray(raw)) {
    return raw.filter(e => e && typeof e === 'object').map(e => ({
      method: (e.method ?? 'GET').toUpperCase(),
      url: String(e.url ?? e.request?.url ?? e.requestUrl ?? ''),
      status: e.status ?? e.statusCode ?? null,
      contentType: e.contentType ?? e.response?.contentType ?? '',
      responseBody: e.responseBody, requestHeaders: e.requestHeaders,
    }));
  }
  return [];
}

/**
 * Normalize a URL into a pattern by replacing dynamic segments.
 * e.g. /api/video/12345 → /api/video/{id}
 */
export function urlToPattern(url: string): string {
  try {
    const p = new URL(url);
    const pathNorm = p.pathname
      .replace(/\/\d+/g, '/{id}')
      .replace(/\/[0-9a-fA-F]{8,}/g, '/{hex}')
      .replace(/\/BV[a-zA-Z0-9]{10}/g, '/{bvid}');
    const params: string[] = [];
    p.searchParams.forEach((_v, k) => { if (!VOLATILE_PARAMS.has(k)) params.push(k); });
    return `${p.host}${pathNorm}${params.length ? '?' + params.sort().map(k => `${k}={}`).join('&') : ''}`;
  } catch { return url; }
}

/**
 * Detect authentication indicators from request headers.
 */
export function detectAuthIndicators(headers?: Record<string, string>): string[] {
  if (!headers) return [];
  const indicators: string[] = [];
  const keys = Object.keys(headers).map(k => k.toLowerCase());
  if (keys.some(k => k === 'authorization')) indicators.push('bearer');
  if (keys.some(k => k.startsWith('x-csrf') || k.startsWith('x-xsrf'))) indicators.push('csrf');
  if (keys.some(k => k.startsWith('x-s') || k === 'x-t' || k === 'x-s-common')) indicators.push('signature');
  return indicators;
}
