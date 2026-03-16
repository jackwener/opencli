/**
 * Smoke tests for external API health.
 * Only run on schedule or manual dispatch — NOT on every push/PR.
 * These verify that external APIs haven't changed their structure.
 */

import { describe, it, expect } from 'vitest';
import { runCli, parseJsonOutput } from '../e2e/helpers.js';

describe('API health smoke tests', () => {

  // ── Public API commands (should always work) ──
  it('hackernews API is responsive and returns expected structure', async () => {
    const { stdout, code } = await runCli(['hackernews', 'top', '--limit', '5', '-f', 'json']);
    expect(code).toBe(0);
    const data = parseJsonOutput(stdout);
    expect(data.length).toBe(5);
    for (const item of data) {
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('author');
      expect(item).toHaveProperty('rank');
    }
  }, 30_000);

  it('v2ex hot API is responsive', async () => {
    const { stdout, code } = await runCli(['v2ex', 'hot', '--limit', '3', '-f', 'json']);
    expect(code).toBe(0);
    const data = parseJsonOutput(stdout);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0]).toHaveProperty('title');
  }, 30_000);

  it('v2ex latest API is responsive', async () => {
    const { stdout, code } = await runCli(['v2ex', 'latest', '--limit', '3', '-f', 'json']);
    expect(code).toBe(0);
    const data = parseJsonOutput(stdout);
    expect(data.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('v2ex topic API is responsive', async () => {
    const { stdout, code } = await runCli(['v2ex', 'topic', '--id', '1000001', '-f', 'json']);
    if (code === 0) {
      const data = parseJsonOutput(stdout);
      expect(data).toBeDefined();
    }
  }, 30_000);

  // ── Validate all adapters ──
  it('all adapter definitions are valid', async () => {
    const { stdout, code } = await runCli(['validate']);
    expect(code).toBe(0);
    expect(stdout).toContain('PASS');
  });

  // ── Command registry integrity ──
  it('all expected sites are registered', async () => {
    const { stdout, code } = await runCli(['list', '-f', 'json']);
    expect(code).toBe(0);
    const data = parseJsonOutput(stdout);
    const sites = new Set(data.map((d: any) => d.site));
    // Verify all 18 sites are present
    for (const expected of [
      'hackernews', 'bbc', 'bilibili', 'v2ex', 'weibo', 'zhihu',
      'twitter', 'reddit', 'xueqiu', 'reuters', 'youtube',
      'smzdm', 'boss', 'ctrip', 'coupang', 'xiaohongshu',
      'yahoo-finance', 'xueqiu',
    ]) {
      expect(sites.has(expected)).toBe(true);
    }
  });
});
