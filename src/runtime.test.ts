import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractBrowserEnvOverrides, withBrowserEnvOverrides } from './runtime.js';

describe('browser env overrides', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('extracts browser overrides from commander-style option names', () => {
    expect(extractBrowserEnvOverrides({
      'browser-cdp': true,
      'cdp-endpoint': ' http://127.0.0.1:9333 ',
      'cdp-target': ' antigravity ',
    })).toEqual({
      browserCdp: true,
      cdpEndpoint: 'http://127.0.0.1:9333',
      cdpTarget: 'antigravity',
    });
  });

  it('rejects invalid cdp endpoint values early', () => {
    expect(() => extractBrowserEnvOverrides({
      'cdp-endpoint': 'foobar',
    })).toThrow('Invalid --cdp-endpoint value');
  });

  it('temporarily applies overrides and restores previous values', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://127.0.0.1:9222');
    vi.stubEnv('OPENCLI_CDP_TARGET', 'codex');

    let seenEndpoint: string | undefined;
    let seenTarget: string | undefined;

    await withBrowserEnvOverrides({
      cdpEndpoint: 'http://127.0.0.1:9333',
      cdpTarget: 'antigravity',
    }, async () => {
      seenEndpoint = process.env.OPENCLI_CDP_ENDPOINT;
      seenTarget = process.env.OPENCLI_CDP_TARGET;
    });

    expect(seenEndpoint).toBe('http://127.0.0.1:9333');
    expect(seenTarget).toBe('antigravity');
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBe('http://127.0.0.1:9222');
    expect(process.env.OPENCLI_CDP_TARGET).toBe('codex');
  });

  it('leaves unrelated browser env unchanged when an override is omitted', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://127.0.0.1:9222');
    vi.stubEnv('OPENCLI_CDP_TARGET', 'cursor');

    let seenEndpoint: string | undefined;
    let seenTarget: string | undefined;

    await withBrowserEnvOverrides({
      cdpEndpoint: 'http://127.0.0.1:9333',
    }, async () => {
      seenEndpoint = process.env.OPENCLI_CDP_ENDPOINT;
      seenTarget = process.env.OPENCLI_CDP_TARGET;
    });

    expect(seenEndpoint).toBe('http://127.0.0.1:9333');
    expect(seenTarget).toBe('cursor');
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBe('http://127.0.0.1:9222');
    expect(process.env.OPENCLI_CDP_TARGET).toBe('cursor');
  });

  it('prefers command-level browser-cdp auto mode over existing env defaults', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://127.0.0.1:9222');

    let seenEndpoint: string | undefined;
    await withBrowserEnvOverrides({
      browserCdp: true,
    }, async () => {
      seenEndpoint = process.env.OPENCLI_CDP_ENDPOINT;
    }, { allowBrowserCdp: true });

    expect(seenEndpoint).toBe('auto');
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBe('http://127.0.0.1:9222');
  });

  it('honors --no-browser-cdp by clearing an inherited endpoint during the command', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'http://127.0.0.1:9222');

    let seenEndpoint: string | undefined;
    await withBrowserEnvOverrides({
      browserCdp: false,
    }, async () => {
      seenEndpoint = process.env.OPENCLI_CDP_ENDPOINT;
    }, { allowBrowserCdp: true });

    expect(seenEndpoint).toBeUndefined();
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBe('http://127.0.0.1:9222');
  });

  it('restores outer overrides correctly across nested calls', async () => {
    const seen: Array<{ label: string; endpoint?: string; target?: string }> = [];

    await withBrowserEnvOverrides({
      cdpEndpoint: 'http://127.0.0.1:9333',
      cdpTarget: 'outer',
    }, async () => {
      seen.push({
        label: 'outer-before',
        endpoint: process.env.OPENCLI_CDP_ENDPOINT,
        target: process.env.OPENCLI_CDP_TARGET,
      });

      await withBrowserEnvOverrides({
        cdpEndpoint: 'http://127.0.0.1:9444',
        cdpTarget: 'inner',
      }, async () => {
        seen.push({
          label: 'inner',
          endpoint: process.env.OPENCLI_CDP_ENDPOINT,
          target: process.env.OPENCLI_CDP_TARGET,
        });
      });

      seen.push({
        label: 'outer-after',
        endpoint: process.env.OPENCLI_CDP_ENDPOINT,
        target: process.env.OPENCLI_CDP_TARGET,
      });
    });

    expect(seen).toEqual([
      { label: 'outer-before', endpoint: 'http://127.0.0.1:9333', target: 'outer' },
      { label: 'inner', endpoint: 'http://127.0.0.1:9444', target: 'inner' },
      { label: 'outer-after', endpoint: 'http://127.0.0.1:9333', target: 'outer' },
    ]);
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBeUndefined();
    expect(process.env.OPENCLI_CDP_TARGET).toBeUndefined();
  });

  it('honors global browser cdp default only for commands that allow it', async () => {
    vi.stubEnv('OPENCLI_BROWSER_CDP', '1');

    let seenAllowed: string | undefined;
    await withBrowserEnvOverrides({}, async () => {
      seenAllowed = process.env.OPENCLI_CDP_ENDPOINT;
    }, { allowBrowserCdp: true });

    let seenDisallowed: string | undefined;
    await withBrowserEnvOverrides({}, async () => {
      seenDisallowed = process.env.OPENCLI_CDP_ENDPOINT;
    }, { allowBrowserCdp: false });

    expect(seenAllowed).toBe('auto');
    expect(seenDisallowed).toBeUndefined();
  });
});
