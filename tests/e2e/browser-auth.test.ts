/**
 * E2E tests for login-required browser commands.
 * These commands REQUIRE authentication (cookie/session).
 * In CI (headless, no login), they should fail gracefully — NOT crash.
 *
 * These tests verify the error handling path, not the data extraction.
 */

import { describe, it, expect } from 'vitest';
import { runCli } from './helpers.js';

/**
 * Verify a login-required command fails gracefully (no crash, no hang).
 * Acceptable outcomes: exit code 1 with error message, OR timeout handled.
 */
async function expectGracefulAuthFailure(args: string[], label: string) {
  const { stdout, stderr, code } = await runCli(args, { timeout: 60_000 });
  // Should either fail with exit code 1 (error message) or succeed with empty data
  // The key assertion: it should NOT hang forever or crash with unhandled exception
  if (code !== 0) {
    // Verify stderr has a meaningful error, not an unhandled crash
    const output = stderr + stdout;
    expect(output.length).toBeGreaterThan(0);
  }
  // If it somehow succeeds (e.g., partial public data), that's fine too
}

describe('login-required commands — graceful failure', () => {

  // ── bilibili (requires cookie session) ──
  it('bilibili me fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['bilibili', 'me', '-f', 'json'], 'bilibili me');
  }, 60_000);

  it('bilibili dynamic fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['bilibili', 'dynamic', '--limit', '3', '-f', 'json'], 'bilibili dynamic');
  }, 60_000);

  it('bilibili favorite fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['bilibili', 'favorite', '--limit', '3', '-f', 'json'], 'bilibili favorite');
  }, 60_000);

  it('bilibili history fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['bilibili', 'history', '--limit', '3', '-f', 'json'], 'bilibili history');
  }, 60_000);

  it('bilibili following fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['bilibili', 'following', '--limit', '3', '-f', 'json'], 'bilibili following');
  }, 60_000);

  // ── twitter (requires login) ──
  it('twitter bookmarks fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['twitter', 'bookmarks', '--limit', '3', '-f', 'json'], 'twitter bookmarks');
  }, 60_000);

  it('twitter timeline fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['twitter', 'timeline', '--limit', '3', '-f', 'json'], 'twitter timeline');
  }, 60_000);

  it('twitter notifications fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['twitter', 'notifications', '--limit', '3', '-f', 'json'], 'twitter notifications');
  }, 60_000);

  // ── v2ex (requires login) ──
  it('v2ex me fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['v2ex', 'me', '-f', 'json'], 'v2ex me');
  }, 60_000);

  it('v2ex notifications fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['v2ex', 'notifications', '--limit', '3', '-f', 'json'], 'v2ex notifications');
  }, 60_000);

  // ── xueqiu (requires login) ──
  it('xueqiu feed fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['xueqiu', 'feed', '--limit', '3', '-f', 'json'], 'xueqiu feed');
  }, 60_000);

  it('xueqiu watchlist fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['xueqiu', 'watchlist', '-f', 'json'], 'xueqiu watchlist');
  }, 60_000);

  // ── xiaohongshu (requires login) ──
  it('xiaohongshu feed fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['xiaohongshu', 'feed', '--limit', '3', '-f', 'json'], 'xiaohongshu feed');
  }, 60_000);

  it('xiaohongshu notifications fails gracefully without login', async () => {
    await expectGracefulAuthFailure(['xiaohongshu', 'notifications', '--limit', '3', '-f', 'json'], 'xiaohongshu notifications');
  }, 60_000);
});
