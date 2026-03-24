/**
 * Endpoint analysis: filtering, deduplication, scoring, and response body analysis.
 */

import { VOLATILE_PARAMS, SEARCH_PARAMS, PAGINATION_PARAMS, LIMIT_PARAMS, FIELD_ROLES } from '../constants.js';
import type { NetworkEntry, AnalyzedEndpoint, ResponseAnalysis } from './types.js';
import { urlToPattern, detectAuthIndicators } from './network.js';

/**
 * Analyze a JSON response body to find the best array of data items.
 * Recursively searches up to 4 levels deep for arrays of objects.
 */
export function analyzeResponseBody(body: unknown): ResponseAnalysis | null {
  if (!body || typeof body !== 'object') return null;
  const candidates: Array<{ path: string; items: unknown[] }> = [];

  function findArrays(obj: unknown, path: string, depth: number) {
    if (depth > 4) return;
    if (Array.isArray(obj) && obj.length >= 2 && obj.some(item => item && typeof item === 'object' && !Array.isArray(item))) {
      candidates.push({ path, items: obj });
    }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [key, val] of Object.entries(obj)) findArrays(val, path ? `${path}.${key}` : key, depth + 1);
    }
  }
  findArrays(body, '', 0);
  if (!candidates.length) return null;

  candidates.sort((a, b) => b.items.length - a.items.length);
  const best = candidates[0];
  const sample = best.items[0];
  const sampleFields = sample && typeof sample === 'object' ? flattenFields(sample, '', 2) : [];

  const detectedFields: Record<string, string> = {};
  for (const [role, aliases] of Object.entries(FIELD_ROLES)) {
    for (const f of sampleFields) {
      if (aliases.includes(f.split('.').pop()?.toLowerCase() ?? '')) { detectedFields[role] = f; break; }
    }
  }

  return { itemPath: best.path || null, itemCount: best.items.length, detectedFields, sampleFields };
}

/**
 * Flatten an object's keys into dot-notation paths, up to maxDepth levels.
 */
export function flattenFields(obj: unknown, prefix: string, maxDepth: number): string[] {
  if (maxDepth <= 0 || !obj || typeof obj !== 'object') return [];
  const names: string[] = [];
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const full = prefix ? `${prefix}.${key}` : key;
    names.push(full);
    const val = record[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) names.push(...flattenFields(val, full, maxDepth - 1));
  }
  return names;
}

/**
 * Score an endpoint based on content type, response quality, and parameter types.
 */
export function scoreEndpoint(ep: {
  contentType: string;
  responseAnalysis: AnalyzedEndpoint['responseAnalysis'];
  pattern: string;
  status: number | null;
  hasSearchParam: boolean;
  hasPaginationParam: boolean;
  hasLimitParam: boolean;
}): number {
  let s = 0;
  if (ep.contentType.includes('json')) s += 10;
  if (ep.responseAnalysis) {
    s += 5;
    s += Math.min(ep.responseAnalysis.itemCount, 10);
    s += Object.keys(ep.responseAnalysis.detectedFields).length * 2;
  }
  if (ep.pattern.includes('/api/') || ep.pattern.includes('/x/')) s += 3;
  if (ep.hasSearchParam) s += 3;
  if (ep.hasPaginationParam) s += 2;
  if (ep.hasLimitParam) s += 2;
  if (ep.status === 200) s += 2;
  // Anti-Bot Empty Value Detection: penalize JSON endpoints returning empty data
  if (ep.responseAnalysis && ep.responseAnalysis.itemCount === 0 && ep.contentType.includes('json')) s -= 3;
  return s;
}

/**
 * Filter, deduplicate, and score network endpoints.
 * Returns analyzed endpoints sorted by score and the total count before filtering.
 */
export function analyzeEndpoints(networkEntries: NetworkEntry[]): { analyzed: AnalyzedEndpoint[]; totalCount: number } {
  const seen = new Map<string, AnalyzedEndpoint>();
  for (const entry of networkEntries) {
    if (!entry.url) continue;
    const ct = entry.contentType.toLowerCase();
    if (ct.includes('image/') || ct.includes('font/') || ct.includes('css') || ct.includes('javascript') || ct.includes('wasm')) continue;
    if (entry.status && entry.status >= 400) continue;

    const pattern = urlToPattern(entry.url);
    const key = `${entry.method}:${pattern}`;
    if (seen.has(key)) continue;

    const qp: string[] = [];
    try { new URL(entry.url).searchParams.forEach((_v, k) => { if (!VOLATILE_PARAMS.has(k)) qp.push(k); }); } catch {}

    const ep: AnalyzedEndpoint = {
      pattern, method: entry.method, url: entry.url, status: entry.status, contentType: ct,
      queryParams: qp, hasSearchParam: qp.some(p => SEARCH_PARAMS.has(p)),
      hasPaginationParam: qp.some(p => PAGINATION_PARAMS.has(p)),
      hasLimitParam: qp.some(p => LIMIT_PARAMS.has(p)),
      authIndicators: detectAuthIndicators(entry.requestHeaders),
      responseAnalysis: entry.responseBody ? analyzeResponseBody(entry.responseBody) : null,
      score: 0,
    };
    ep.score = scoreEndpoint(ep);
    seen.set(key, ep);
  }

  const analyzed = [...seen.values()].filter(ep => ep.score >= 5).sort((a, b) => b.score - a.score);
  return { analyzed, totalCount: seen.size };
}
