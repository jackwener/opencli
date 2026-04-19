import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserBridge, CDPBridge } from './browser/index.js';
import { getBrowserFactory } from './runtime.js';

describe('getBrowserFactory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses BrowserBridge for regular browser sites by default', () => {
    expect(getBrowserFactory('douban')).toBe(BrowserBridge);
  });

  it('uses CDPBridge for browser sites when OPENCLI_CDP_ENDPOINT is set', () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://127.0.0.1:9222');

    expect(getBrowserFactory('douban')).toBe(CDPBridge);
  });
});
