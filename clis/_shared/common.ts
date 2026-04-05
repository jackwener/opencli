/**
 * Shared utilities for CLI adapters.
 */

import type { IPage } from '../../src/types.js';

/**
 * Clamp a numeric value to [min, max].
 * Matches the signature of lodash.clamp and Rust's clamp.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

// ── Browser evaluate helpers ────────────────────────────────────────────────

export interface EvaluateFetchOptions {
  /** HTTP method. Default: 'GET'. */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Query parameters — appended to the URL. */
  params?: Record<string, string | number>;
  /** JSON body for POST/PUT requests. */
  body?: Record<string, unknown>;
  /** Extra headers to include in the request. */
  headers?: Record<string, string>;
  /** Credential mode. Default: 'include' (sends cookies). */
  credentials?: 'include' | 'omit' | 'same-origin';
}

/**
 * Perform a `fetch()` call **inside the browser page context** and return the
 * parsed JSON response.
 *
 * This is the most common pattern in cookie-tier adapters: the page has been
 * navigated to the target domain (establishing cookie context + any SDK patches
 * like H5Guard/mtgsig), and we want to call an API that requires those cookies.
 *
 * Returns the JSON body on success, or `{ __error, __status? }` on failure so
 * callers can distinguish network/HTTP errors from API-level errors.
 *
 * @example
 * ```ts
 * // Simple GET
 * const data = await evaluateFetch(page, 'https://api.example.com/hot');
 *
 * // GET with query params
 * const data = await evaluateFetch(page, '/api/orders', {
 *   params: { page: 1, limit: 20 },
 * });
 *
 * // POST with JSON body
 * const data = await evaluateFetch(page, '/api/search', {
 *   method: 'POST',
 *   body: { query: 'test', limit: 10 },
 * });
 * ```
 */
export async function evaluateFetch(
  page: IPage,
  url: string,
  options?: EvaluateFetchOptions,
): Promise<any> {
  const method = options?.method ?? 'GET';
  const params = options?.params;
  const body = options?.body;
  const headers = options?.headers;
  const credentials = options?.credentials ?? 'include';

  // Build the full URL with query parameters
  let fullUrl = url;
  if (params) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
  }

  // Build fetch init options as an inline string for evaluate
  const initParts: string[] = [`credentials: '${credentials}'`];
  if (method !== 'GET') {
    initParts.push(`method: '${method}'`);
  }
  const mergedHeaders: Record<string, string> = {};
  if (body) mergedHeaders['Content-Type'] = 'application/json';
  if (headers) Object.assign(mergedHeaders, headers);
  if (Object.keys(mergedHeaders).length > 0) {
    initParts.push(`headers: ${JSON.stringify(mergedHeaders)}`);
  }
  if (body) {
    initParts.push(`body: ${JSON.stringify(JSON.stringify(body))}`);
  }

  const fetchCode = `
    (async () => {
      try {
        const res = await fetch(${JSON.stringify(fullUrl)}, { ${initParts.join(', ')} });
        if (!res.ok) return { __error: 'HTTP ' + res.status, __status: res.status };
        return await res.json();
      } catch (e) {
        return { __error: String(e) };
      }
    })()
  `;

  return page.evaluate(fetchCode);
}
