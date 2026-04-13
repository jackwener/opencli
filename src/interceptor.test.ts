/**
 * Tests for interceptor.ts: JavaScript code generators for XHR/Fetch interception.
 */

import { describe, it, expect } from 'vitest';
import { generateInterceptorJs, generateReadInterceptedJs, generateTapInterceptorJs } from './interceptor.js';

describe('generateInterceptorJs', () => {
  it('generates valid JavaScript function source', () => {
    const js = generateInterceptorJs('"api/search"');
    expect(js).toContain('window.fetch');
    expect(js).toContain('XMLHttpRequest');
    expect(js).toContain('"api/search"');
    // Should be a function expression wrapping
    expect(js.trim()).toMatch(/^\(\)\s*=>/);
  });

  it('uses default array name and patch guard', () => {
    const js = generateInterceptorJs('"test"');
    expect(js).toContain('__opencli_intercepted');
    expect(js).toContain('__opencli_interceptor_patched');
  });

  it('uses custom array name and patch guard', () => {
    const js = generateInterceptorJs('"test"', {
      arrayName: '__my_data',
      patchGuard: '__my_guard',
    });
    expect(js).toContain('__my_data');
    expect(js).toContain('__my_guard');
    expect(js).not.toContain('__opencli_intercepted');
  });

  it('includes fetch clone and json parsing', () => {
    const js = generateInterceptorJs('"api"');
    expect(js).toContain('response.clone()');
    expect(js).toContain('clone.json()');
  });

  it('includes XHR open and send patching', () => {
    const js = generateInterceptorJs('"api"');
    expect(js).toContain('XMLHttpRequest.prototype');
    expect(js).toContain('__origOpen');
    expect(js).toContain('__origSend');
  });

  it('treats an empty pattern as match-all for compatibility fallbacks', () => {
    const js = generateInterceptorJs('""');
    expect(js).toContain("pattern === ''");
  });
});

describe('generateReadInterceptedJs', () => {
  it('generates valid JavaScript to read and clear data', () => {
    const js = generateReadInterceptedJs();
    expect(js).toContain('__opencli_intercepted');
    // Should clear the array after reading
    expect(js).toContain('= []');
  });

  it('uses custom array name', () => {
    const js = generateReadInterceptedJs('__custom_arr');
    expect(js).toContain('__custom_arr');
    expect(js).not.toContain('__opencli_intercepted');
  });
});

describe('generateTapInterceptorJs', () => {
  it('returns all required fields', () => {
    const tap = generateTapInterceptorJs('"api/data"');

    expect(tap.setupVar).toBeDefined();
    expect(tap.capturedVar).toBe('captured');
    expect(tap.promiseVar).toBe('capturePromise');
    expect(tap.resolveVar).toBe('captureResolve');
    expect(tap.fetchPatch).toBeDefined();
    expect(tap.xhrPatch).toBeDefined();
    expect(tap.restorePatch).toBeDefined();
  });

  it('contains the capture pattern in setup', () => {
    const tap = generateTapInterceptorJs('"my-pattern"');
    expect(tap.setupVar).toContain('"my-pattern"');
  });

  it('restores original fetch and XHR in restorePatch', () => {
    const tap = generateTapInterceptorJs('"test"');
    expect(tap.restorePatch).toContain('origFetch');
    expect(tap.restorePatch).toContain('origXhrOpen');
    expect(tap.restorePatch).toContain('origXhrSend');
  });

  it('uses first-match capture (only first response)', () => {
    const tap = generateTapInterceptorJs('"test"');
    // Both fetch and xhr patches should check !captured before storing
    expect(tap.fetchPatch).toContain('!captured');
    expect(tap.xhrPatch).toContain('!captured');
  });
});
