/**
 * API Discovery — analyzes captured network requests to find the "golden API"
 * that directly provides the data the user wanted.
 *
 * Scores each request and recommends the best strategy for the generated adapter.
 */

import type { CapturedRequest, RichTrace } from './trace-recorder.js';

export type StrategyRecommendation = 'public' | 'cookie' | 'intercept' | 'ui';

export interface GoldenAPI {
  /** The API endpoint URL */
  url: string;
  method: string;
  /** A sample of the response body (truncated for prompt) */
  responseSample: string;
  /** How many fields overlap with the final extracted data */
  fieldOverlap: number;
  /** The largest array found in the response */
  arrayPath: string | null;
  arrayLength: number;
  /** Overall quality score (0-100) */
  score: number;
}

export interface DiscoveryResult {
  strategy: StrategyRecommendation;
  goldenApi: GoldenAPI | null;
  /** All API candidates sorted by score */
  candidates: GoldenAPI[];
  /** Auth requirements detected */
  needsAuth: boolean;
  needsCsrf: boolean;
}

/**
 * Analyze a rich trace to discover the best API and recommend a strategy.
 */
export function discoverApi(trace: RichTrace): DiscoveryResult {
  const candidates: GoldenAPI[] = [];

  // Filter to JSON API responses
  const apiRequests = trace.networkCapture.filter(req =>
    req.responseBody !== null
    && req.status >= 200 && req.status < 400
    && !isStaticResource(req.url)
    && req.contentType.includes('json')
  );

  // Extract field names from the final data for overlap scoring
  const targetFields = extractFieldNames(trace.finalData);

  for (const req of apiRequests) {
    const { path: arrayPath, length: arrayLength } = findLargestArray(req.responseBody);
    const responseFields = extractFieldNames(req.responseBody);
    const fieldOverlap = countOverlap(targetFields, responseFields);

    const score = scoreRequest(req, fieldOverlap, arrayLength, targetFields.size);

    if (score > 10) { // Minimum threshold
      candidates.push({
        url: req.url,
        method: req.method,
        responseSample: JSON.stringify(req.responseBody).slice(0, 3000),
        fieldOverlap,
        arrayPath,
        arrayLength,
        score,
      });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  const goldenApi = candidates.length > 0 ? candidates[0] : null;
  const AUTH_COOKIE_PATTERN = /^(session|sess|auth|token|jwt|access|refresh|user_id|uid|logged|ct0|sid|_session)/i;
  const needsAuth = trace.authContext.cookieNames.some(name => AUTH_COOKIE_PATTERN.test(name))
    || trace.authContext.csrfPresent;
  const needsCsrf = trace.authContext.csrfPresent;

  // Determine strategy
  let strategy: StrategyRecommendation;
  if (goldenApi && goldenApi.score >= 40) {
    // Found a good API
    if (!needsAuth) {
      strategy = 'public';
    } else {
      strategy = 'cookie';
    }
  } else if (trace.steps.length > 0) {
    // No good API found, need UI interaction
    strategy = 'ui';
  } else {
    strategy = 'public';
  }

  return {
    strategy,
    goldenApi,
    candidates: candidates.slice(0, 5), // Top 5
    needsAuth,
    needsCsrf,
  };
}

// ── Scoring ──────────────────────────────────────────────────────────

function scoreRequest(
  req: CapturedRequest,
  fieldOverlap: number,
  arrayLength: number,
  totalTargetFields: number,
): number {
  let score = 0;

  // Field overlap is the strongest signal (0-40 points)
  if (totalTargetFields > 0) {
    score += Math.min(40, (fieldOverlap / totalTargetFields) * 40);
  }

  // Array presence and size (0-25 points)
  if (arrayLength > 0) {
    score += Math.min(25, arrayLength * 2.5);
  }

  // API-like URL patterns (0-15 points)
  const url = req.url.toLowerCase();
  if (url.includes('/api/') || url.includes('/graphql')) score += 15;
  else if (url.includes('/v1/') || url.includes('/v2/') || url.includes('/rest/')) score += 10;
  else if (url.includes('.json')) score += 5;

  // Penalize tracking/analytics (0 to -20)
  if (isTrackingUrl(url)) score -= 20;

  // Penalize tiny responses (likely config/health)
  if (req.responseSize < 100) score -= 10;

  // Bonus for structured response
  if (req.responseBody && typeof req.responseBody === 'object') score += 5;

  return Math.max(0, score);
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Recursively extract all field names from a JSON value. */
function extractFieldNames(data: unknown): Set<string> {
  const fields = new Set<string>();
  const seen = new WeakSet();

  function walk(obj: unknown) {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== 'object') return;
    if (seen.has(obj as object)) return;
    seen.add(obj as object);

    if (Array.isArray(obj)) {
      // Sample first 3 items
      for (let i = 0; i < Math.min(3, obj.length); i++) {
        walk(obj[i]);
      }
    } else {
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        fields.add(key.toLowerCase());
        walk((obj as Record<string, unknown>)[key]);
      }
    }
  }

  walk(data);
  return fields;
}

/** Find the largest array in a nested JSON structure. */
function findLargestArray(data: unknown): { path: string | null; length: number } {
  let bestPath: string | null = null;
  let bestLength = 0;
  const seen = new WeakSet();

  function walk(obj: unknown, path: string) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return;
    if (seen.has(obj as object)) return;
    seen.add(obj as object);

    if (Array.isArray(obj)) {
      if (obj.length > bestLength && obj.length >= 2) {
        // Only count arrays of objects (data arrays, not strings/numbers)
        if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
          bestPath = path;
          bestLength = obj.length;
        }
      }
      for (let i = 0; i < Math.min(2, obj.length); i++) {
        walk(obj[i], `${path}[${i}]`);
      }
    } else {
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        walk((obj as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
    }
  }

  walk(data, '');
  return { path: bestPath, length: bestLength };
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count++;
  }
  return count;
}

function isStaticResource(url: string): boolean {
  return /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|mp4|webp)(\?|$)/i.test(url);
}

function isTrackingUrl(url: string): boolean {
  return /analytics|tracking|telemetry|beacon|pixel|gtag|gtm|fbevents|doubleclick|adservice/i.test(url);
}
