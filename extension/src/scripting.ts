/**
 * JS execution via chrome.scripting.executeScript (Manifest V3).
 *
 * Unlike cdp.ts which uses chrome.debugger (CDP), this executor leaves
 * ZERO CDP fingerprint on the page.  Websites cannot detect that
 * automation is controlling the browser.
 *
 * LIMITATION: Sites with strict Content Security Policy (CSP) that block
 * `unsafe-eval` (e.g., Twitter/X, Google) will reject eval(). In that
 * case, we automatically fall back to CDP via cdp.ts.
 */

import * as cdp from './cdp';

/** Set of tabIds where scripting failed due to CSP, so we skip straight to CDP */
const cspBlockedTabs = new Set<number>();

export async function evaluate(tabId: number, expression: string): Promise<unknown> {
  // If we already know this tab blocks eval, go straight to CDP
  if (cspBlockedTabs.has(tabId)) {
    return cdp.evaluate(tabId, expression);
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (expr: string) => {
        try {
          const result = (0, eval)(expr);
          if (result && typeof result === 'object' && typeof result.then === 'function') {
            return result.then(
              (v: unknown) => JSON.stringify({ ok: true, v }),
              (e: unknown) => JSON.stringify({ ok: false, err: (e as Error)?.message || String(e) }),
            );
          }
          return JSON.stringify({ ok: true, v: result });
        } catch (e) {
          return JSON.stringify({ ok: false, err: (e as Error)?.message || String(e) });
        }
      },
      args: [expression],
    });

    if (!results || results.length === 0) {
      throw new Error('executeScript returned no results');
    }

    const frame = results[0];
    if ((frame as any).error) {
      throw new Error((frame as any).error.message || String((frame as any).error));
    }

    const raw = frame.result;

    // MAIN world eval() returns null if Chrome can't serialize the return value
    if (raw === null || raw === undefined) {
      // Fall back to CDP for this execution
      return cdp.evaluate(tabId, expression);
    }

    // Parse our JSON envelope
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (!parsed.ok) {
        const err = parsed.err || '';
        // Detect CSP errors and remember this tab
        if (err.includes('Content Security Policy') || err.includes("'unsafe-eval'")) {
          cspBlockedTabs.add(tabId);
          return cdp.evaluate(tabId, expression);
        }
        throw new Error(err || 'Eval error');
      }
      return parsed.v;
    }

    return raw;
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    // Catch CSP errors that bubble up as exceptions too
    if (msg.includes('Content Security Policy') || msg.includes("'unsafe-eval'")) {
      cspBlockedTabs.add(tabId);
      return cdp.evaluate(tabId, expression);
    }
    throw e;
  }
}

export const evaluateAsync = evaluate;

// Delegate to CDP for screenshot (no scripting API alternative)
export { screenshot } from './cdp';

export function detach(tabId: number): void {
  cspBlockedTabs.delete(tabId);
  cdp.detach(tabId);
}

export function registerListeners(): void {
  cdp.registerListeners();
  // Clean up CSP cache when tabs are removed
  chrome.tabs.onRemoved.addListener((tabId) => {
    cspBlockedTabs.delete(tabId);
  });
}
