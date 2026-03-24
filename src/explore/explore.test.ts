/**
 * Tests for the explore module — pure function logic only (no browser needed).
 *
 * Covers: site detection, network parsing, endpoint analysis, capability inference.
 */

import { describe, it, expect } from 'vitest';
import { detectSiteName, slugify } from './site.js';
import { parseNetworkRequests, urlToPattern, detectAuthIndicators } from './network.js';
import { analyzeResponseBody, flattenFields, scoreEndpoint, analyzeEndpoints } from './analysis.js';
import { inferCapabilityName, inferStrategy, inferCapabilitiesFromEndpoints } from './capabilities.js';
import type { NetworkEntry, AnalyzedEndpoint } from './types.js';

// ── site.ts ────────────────────────────────────────────────────────────────

describe('detectSiteName', () => {
  it('returns known alias for twitter/x.com', () => {
    expect(detectSiteName('https://x.com/user')).toBe('twitter');
    expect(detectSiteName('https://twitter.com/status')).toBe('twitter');
  });

  it('returns known alias for bilibili', () => {
    expect(detectSiteName('https://www.bilibili.com/video/BV1xx')).toBe('bilibili');
    expect(detectSiteName('https://search.bilibili.com/all?keyword=test')).toBe('bilibili');
  });

  it('extracts site name from arbitrary hostname', () => {
    expect(detectSiteName('https://www.github.com/repo')).toBe('github');
    // api.example.com → parts=['api','example','com'], second-to-last = 'api'
    expect(detectSiteName('https://api.example.com/v1/data')).toBe('api');
  });

  it('handles ccTLDs correctly', () => {
    expect(detectSiteName('https://www.bbc.co.uk/news')).toBe('bbc');
  });

  it('returns "site" for invalid URLs', () => {
    expect(detectSiteName('not-a-url')).toBe('site');
  });
});

describe('slugify', () => {
  it('lowercases and replaces non-alnum chars', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('foo_bar.baz')).toBe('foo-bar-baz');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('--test--')).toBe('test');
  });

  it('returns "site" for empty string', () => {
    expect(slugify('')).toBe('site');
    expect(slugify('   ')).toBe('site');
  });
});

// ── network.ts ─────────────────────────────────────────────────────────────

describe('parseNetworkRequests', () => {
  it('parses text format [METHOD] URL => [STATUS]', () => {
    const raw = '[GET] https://api.example.com/data => [200]\n[POST] https://api.example.com/submit => [201]';
    const entries = parseNetworkRequests(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ method: 'GET', url: 'https://api.example.com/data', status: 200 });
    expect(entries[1]).toMatchObject({ method: 'POST', url: 'https://api.example.com/submit', status: 201 });
  });

  it('parses array format', () => {
    const raw = [
      { method: 'GET', url: 'https://api.example.com/items', status: 200, contentType: 'application/json' },
    ];
    const entries = parseNetworkRequests(raw);
    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe('GET');
  });

  it('returns empty array for unexpected input', () => {
    expect(parseNetworkRequests(42)).toEqual([]);
    expect(parseNetworkRequests(null)).toEqual([]);
  });
});

describe('urlToPattern', () => {
  it('replaces numeric path segments with {id}', () => {
    expect(urlToPattern('https://api.example.com/video/12345')).toBe('api.example.com/video/{id}');
  });

  it('replaces hex IDs with {hex}', () => {
    expect(urlToPattern('https://api.example.com/item/abcdef1234567890')).toBe('api.example.com/item/{hex}');
  });

  it('replaces BV IDs with {bvid}', () => {
    expect(urlToPattern('https://www.bilibili.com/video/BV1aB4y1c7E1')).toBe('www.bilibili.com/video/{bvid}');
  });

  it('strips volatile query params', () => {
    const url = 'https://api.example.com/data?q=test&w_rid=abc&limit=10';
    const pattern = urlToPattern(url);
    expect(pattern).toContain('limit={}');
    expect(pattern).toContain('q={}');
    expect(pattern).not.toContain('w_rid');
  });

  it('returns raw URL for invalid input', () => {
    expect(urlToPattern('not-a-url')).toBe('not-a-url');
  });
});

describe('detectAuthIndicators', () => {
  it('detects bearer token', () => {
    expect(detectAuthIndicators({ Authorization: 'Bearer xxx' })).toContain('bearer');
  });

  it('detects CSRF token', () => {
    expect(detectAuthIndicators({ 'X-CSRF-Token': 'abc' })).toContain('csrf');
  });

  it('detects signature headers', () => {
    expect(detectAuthIndicators({ 'x-s': '123', 'x-t': '456' })).toContain('signature');
  });

  it('returns empty for no auth headers', () => {
    expect(detectAuthIndicators({ 'Content-Type': 'application/json' })).toEqual([]);
  });

  it('returns empty for undefined headers', () => {
    expect(detectAuthIndicators(undefined)).toEqual([]);
  });
});

// ── analysis.ts ────────────────────────────────────────────────────────────

describe('flattenFields', () => {
  it('flattens a nested object to dot-notation paths', () => {
    const obj = { title: 'Hello', author: { name: 'Alice', id: 1 } };
    const fields = flattenFields(obj, '', 2);
    expect(fields).toContain('title');
    expect(fields).toContain('author');
    expect(fields).toContain('author.name');
    expect(fields).toContain('author.id');
  });

  it('respects maxDepth', () => {
    const obj = { a: { b: { c: 'deep' } } };
    // maxDepth=1 only enumerates top-level keys
    const fields1 = flattenFields(obj, '', 1);
    expect(fields1).toContain('a');
    expect(fields1).not.toContain('a.b');
    // maxDepth=2 goes one level deeper
    const fields2 = flattenFields(obj, '', 2);
    expect(fields2).toContain('a');
    expect(fields2).toContain('a.b');
    expect(fields2).not.toContain('a.b.c');
  });

  it('returns empty for non-object', () => {
    expect(flattenFields(null, '', 2)).toEqual([]);
    expect(flattenFields('string', '', 2)).toEqual([]);
  });
});

describe('analyzeResponseBody', () => {
  it('finds the best array of item objects', () => {
    const body = {
      data: {
        list: [
          { title: 'Item 1', url: 'https://example.com/1' },
          { title: 'Item 2', url: 'https://example.com/2' },
        ],
      },
    };
    const result = analyzeResponseBody(body);
    expect(result).not.toBeNull();
    expect(result!.itemPath).toBe('data.list');
    expect(result!.itemCount).toBe(2);
    expect(result!.detectedFields).toHaveProperty('title');
    expect(result!.detectedFields).toHaveProperty('url');
  });

  it('returns null for non-object body', () => {
    expect(analyzeResponseBody(null)).toBeNull();
    expect(analyzeResponseBody('string')).toBeNull();
  });

  it('returns null when no arrays found', () => {
    expect(analyzeResponseBody({ key: 'value' })).toBeNull();
  });

  it('ignores arrays of primitives', () => {
    expect(analyzeResponseBody({ tags: ['a', 'b', 'c'] })).toBeNull();
  });
});

describe('scoreEndpoint', () => {
  it('gives higher score to JSON endpoints', () => {
    const jsonEp = { contentType: 'application/json', responseAnalysis: null, pattern: '/data', status: 200, hasSearchParam: false, hasPaginationParam: false, hasLimitParam: false };
    const htmlEp = { contentType: 'text/html', responseAnalysis: null, pattern: '/page', status: 200, hasSearchParam: false, hasPaginationParam: false, hasLimitParam: false };
    expect(scoreEndpoint(jsonEp)).toBeGreaterThan(scoreEndpoint(htmlEp));
  });

  it('rewards search/pagination/limit params', () => {
    const base = { contentType: 'application/json', responseAnalysis: null, pattern: '/api/data', status: 200, hasSearchParam: false, hasPaginationParam: false, hasLimitParam: false };
    const withSearch = { ...base, hasSearchParam: true };
    expect(scoreEndpoint(withSearch)).toBeGreaterThan(scoreEndpoint(base));
  });

  it('penalizes empty JSON response relative to populated response', () => {
    const emptyResponse = {
      contentType: 'application/json', pattern: '/api/data', status: 200,
      hasSearchParam: false, hasPaginationParam: false, hasLimitParam: false,
      responseAnalysis: { itemPath: 'data', itemCount: 0, detectedFields: {}, sampleFields: [] },
    };
    const populatedResponse = {
      contentType: 'application/json', pattern: '/api/data', status: 200,
      hasSearchParam: false, hasPaginationParam: false, hasLimitParam: false,
      responseAnalysis: { itemPath: 'data', itemCount: 5, detectedFields: { title: 'title' }, sampleFields: ['title'] },
    };
    // Empty response gets +5 (responseAnalysis exists) -3 (penalty) = +2 net
    // Populated gets +5 +5(items) +2(fields) = +12 net, so populated > empty
    expect(scoreEndpoint(emptyResponse)).toBeLessThan(scoreEndpoint(populatedResponse));
  });
});

describe('analyzeEndpoints', () => {
  it('filters out static resources', () => {
    const entries: NetworkEntry[] = [
      { method: 'GET', url: 'https://example.com/api/data', status: 200, contentType: 'application/json' },
      { method: 'GET', url: 'https://example.com/style.css', status: 200, contentType: 'text/css' },
      { method: 'GET', url: 'https://example.com/logo.png', status: 200, contentType: 'image/png' },
    ];
    const { analyzed, totalCount } = analyzeEndpoints(entries);
    expect(totalCount).toBe(1); // only the JSON endpoint counted
    expect(analyzed.every(ep => !ep.contentType.includes('css'))).toBe(true);
  });

  it('deduplicates by method+pattern', () => {
    const entries: NetworkEntry[] = [
      { method: 'GET', url: 'https://api.example.com/items?page=1', status: 200, contentType: 'application/json' },
      { method: 'GET', url: 'https://api.example.com/items?page=2', status: 200, contentType: 'application/json' },
    ];
    const { totalCount } = analyzeEndpoints(entries);
    expect(totalCount).toBe(1); // same pattern, deduplicated
  });

  it('filters out 4xx/5xx responses', () => {
    const entries: NetworkEntry[] = [
      { method: 'GET', url: 'https://example.com/api/fail', status: 404, contentType: 'application/json' },
      { method: 'GET', url: 'https://example.com/api/error', status: 500, contentType: 'application/json' },
    ];
    const { totalCount } = analyzeEndpoints(entries);
    expect(totalCount).toBe(0);
  });
});

// ── capabilities.ts ────────────────────────────────────────────────────────

describe('inferCapabilityName', () => {
  it('returns goal when provided', () => {
    expect(inferCapabilityName('https://any.url/path', 'my-goal')).toBe('my-goal');
  });

  it('detects hot/trending', () => {
    expect(inferCapabilityName('https://api.example.com/hot')).toBe('hot');
    expect(inferCapabilityName('https://api.example.com/trending')).toBe('hot');
  });

  it('detects search', () => {
    expect(inferCapabilityName('https://api.example.com/search?q=test')).toBe('search');
  });

  it('detects feed/timeline', () => {
    expect(inferCapabilityName('https://api.example.com/feed')).toBe('feed');
    expect(inferCapabilityName('https://api.example.com/timeline')).toBe('feed');
  });

  it('falls back to last path segment', () => {
    expect(inferCapabilityName('https://api.example.com/v1/recommendations')).toBe('recommendations');
  });

  it('returns "data" when nothing matches', () => {
    expect(inferCapabilityName('https://api.example.com/')).toBe('data');
  });
});

describe('inferStrategy', () => {
  it('returns intercept for signature', () => {
    expect(inferStrategy(['signature'])).toBe('intercept');
  });

  it('returns header for bearer', () => {
    expect(inferStrategy(['bearer'])).toBe('header');
  });

  it('returns header for csrf', () => {
    expect(inferStrategy(['csrf'])).toBe('header');
  });

  it('returns cookie as default', () => {
    expect(inferStrategy([])).toBe('cookie');
  });

  it('prefers intercept over header', () => {
    expect(inferStrategy(['bearer', 'signature'])).toBe('intercept');
  });
});

describe('inferCapabilitiesFromEndpoints', () => {
  const makeEndpoint = (overrides: Partial<AnalyzedEndpoint> = {}): AnalyzedEndpoint => ({
    pattern: 'api.example.com/hot',
    method: 'GET',
    url: 'https://api.example.com/hot',
    status: 200,
    contentType: 'application/json',
    queryParams: [],
    score: 15,
    hasSearchParam: false,
    hasPaginationParam: false,
    hasLimitParam: false,
    authIndicators: [],
    responseAnalysis: {
      itemPath: 'data.list',
      itemCount: 10,
      detectedFields: { title: 'title', url: 'link' },
      sampleFields: ['title', 'link', 'score'],
    },
    ...overrides,
  });

  it('generates capabilities from endpoints', () => {
    const { capabilities } = inferCapabilitiesFromEndpoints(
      [makeEndpoint()], [], { url: 'https://api.example.com' },
    );
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0].name).toBe('hot');
    expect(capabilities[0].strategy).toBe('cookie');
    expect(capabilities[0].confidence).toBeGreaterThan(0);
  });

  it('deduplicates capability names', () => {
    const { capabilities } = inferCapabilitiesFromEndpoints(
      [makeEndpoint(), makeEndpoint({ url: 'https://api.example.com/hot/v2', pattern: 'api.example.com/hot/v2' })],
      [], { url: 'https://api.example.com' },
    );
    expect(capabilities).toHaveLength(2);
    // Second should have a suffix
    expect(capabilities[1].name).not.toBe('hot');
  });

  it('detects top strategy across endpoints', () => {
    const { topStrategy } = inferCapabilitiesFromEndpoints(
      [makeEndpoint({ authIndicators: ['bearer'] })],
      [], { url: 'https://example.com' },
    );
    expect(topStrategy).toBe('header');
  });

  it('returns public strategy when no auth indicators', () => {
    const { topStrategy } = inferCapabilitiesFromEndpoints(
      [makeEndpoint({ authIndicators: [] })],
      [], { url: 'https://example.com' },
    );
    expect(topStrategy).toBe('public');
  });

  it('uses store-action strategy when store matches', () => {
    const endpoint = makeEndpoint({ authIndicators: ['signature'] });
    const stores = [{ type: 'pinia' as const, id: 'hotStore', actions: ['fetchHot'], stateKeys: ['items'] }];
    const { capabilities } = inferCapabilitiesFromEndpoints(
      [endpoint], stores, { url: 'https://example.com' },
    );
    expect(capabilities[0].strategy).toBe('store-action');
    expect(capabilities[0].storeHint).toBeDefined();
  });
});
