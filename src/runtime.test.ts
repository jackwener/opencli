import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserBridge, CDPBridge } from './browser/index.js';
import { extractBrowserEnvOverrides, getBrowserFactory, withBrowserEnvOverrides } from './runtime.js';

describe('runtime browser CDP overrides', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.OPENCLI_CDP_ENDPOINT;
  });

  it('extracts the browser-cdp flag from commander-style options', () => {
    expect(extractBrowserEnvOverrides({ browserCdp: true })).toEqual({ browserCdp: true });
    expect(extractBrowserEnvOverrides({ 'browser-cdp': 'true' })).toEqual({ browserCdp: true });
    expect(extractBrowserEnvOverrides({ browserCdp: false })).toEqual({ browserCdp: false });
  });

  it('uses CDPBridge when OPENCLI_CDP_ENDPOINT is set to auto', () => {
    expect(getBrowserFactory()).toBe(BrowserBridge);

    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'auto');

    expect(getBrowserFactory()).toBe(CDPBridge);
  });

  it('temporarily enables automatic CDP discovery for browser-cdp commands', async () => {
    let seenEndpoint: string | undefined;

    await withBrowserEnvOverrides({ browserCdp: true }, async () => {
      seenEndpoint = process.env.OPENCLI_CDP_ENDPOINT;
      return 'ok';
    });

    expect(seenEndpoint).toBe('auto');
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBeUndefined();
  });

  it('does not overwrite an explicit CDP endpoint', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://127.0.0.1:9222');

    await withBrowserEnvOverrides({ browserCdp: true }, async () => {
      expect(process.env.OPENCLI_CDP_ENDPOINT).toBe('http://127.0.0.1:9222');
    });

    expect(process.env.OPENCLI_CDP_ENDPOINT).toBe('http://127.0.0.1:9222');
  });
});
