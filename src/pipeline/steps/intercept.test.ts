/**
 * Tests for pipeline step: intercept
 */

import { describe, it, expect, vi } from 'vitest';
import { stepIntercept } from './intercept.js';
import { ConfigError } from '../../errors.js';
import type { IPage } from '../../types.js';

/** Minimal mock page that records wait() calls */
function createMockPage(overrides: Partial<IPage> = {}): IPage {
  return {
    goto: vi.fn(),
    evaluate: vi.fn().mockResolvedValue([]),
    getCookies: vi.fn().mockResolvedValue([]),
    snapshot: vi.fn().mockResolvedValue(''),
    click: vi.fn(),
    typeText: vi.fn(),
    pressKey: vi.fn(),
    getFormState: vi.fn().mockResolvedValue({}),
    wait: vi.fn(),
    tabs: vi.fn().mockResolvedValue([]),
    closeTab: vi.fn(),
    newTab: vi.fn(),
    selectTab: vi.fn(),
    networkRequests: vi.fn().mockResolvedValue([]),
    consoleMessages: vi.fn().mockResolvedValue(''),
    scroll: vi.fn(),
    scrollTo: vi.fn(),
    autoScroll: vi.fn(),
    installInterceptor: vi.fn(),
    getInterceptedRequests: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(''),
    ...overrides,
  };
}

describe('stepIntercept', () => {
  it('throws ConfigError when page is null and capture is set', async () => {
    await expect(
      stepIntercept(null, { capture: '/api/data' }, {}, {}),
    ).rejects.toThrow(ConfigError);
  });

  it('returns data without error when capture is empty and page is null', async () => {
    const input = { items: [1, 2, 3] };
    const result = await stepIntercept(null, { capture: '' }, input, {});
    expect(result).toBe(input);
  });

  it('passes timeout value to page.wait without truncation', async () => {
    const page = createMockPage();
    await stepIntercept(page, { capture: '/api/data', timeout: 10 }, {}, {});
    expect(page.wait).toHaveBeenCalledWith(10);
  });
});
