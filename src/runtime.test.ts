import { describe, expect, it, vi } from 'vitest';
import { extractBrowserEnvOverrides, withBrowserEnvOverrides } from './runtime.js';

describe('browser env overrides', () => {
  it('extracts browser overrides from commander-style option names', () => {
    expect(extractBrowserEnvOverrides({
      'cdp-endpoint': ' http://127.0.0.1:9333 ',
      'cdp-target': ' antigravity ',
    })).toEqual({
      cdpEndpoint: 'http://127.0.0.1:9333',
      cdpTarget: 'antigravity',
    });
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
});
