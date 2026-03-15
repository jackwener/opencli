import type { IPage } from './types.js';

function tabCount(tabs: unknown): number {
  if (Array.isArray(tabs)) return tabs.length;
  if (typeof tabs === 'string') {
    const matches = tabs.match(/Tab \d+/g);
    return matches ? matches.length : 0;
  }
  return 0;
}

export async function withTemporaryTab<T>(page: IPage, fn: () => Promise<T>): Promise<T> {
  let closeIndex: number | null = null;
  try {
    const before = tabCount(await page.tabs());
    await page.newTab();
    const after = tabCount(await page.tabs());
    closeIndex = Math.max(after - 1, before);
    if (closeIndex >= 0) {
      await page.selectTab(closeIndex);
    }
    return await fn();
  } finally {
    if (closeIndex != null && closeIndex >= 0) {
      try { await page.closeTab(closeIndex); } catch {}
    }
  }
}
