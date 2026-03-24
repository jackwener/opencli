/**
 * Shared XHR/Fetch interceptor JavaScript generators.
 *
 * Provides a single source of truth for monkey-patching browser
 * fetch() and XMLHttpRequest to capture API responses matching
 * a URL pattern. Used by:
 *   - Page.installInterceptor()  (browser.ts)
 *   - stepIntercept              (pipeline/steps/intercept.ts)
 *   - stepTap                    (pipeline/steps/tap.ts)
 */

/**
 * Generate JavaScript source that installs a fetch/XHR interceptor.
 * Captured responses are pushed to `window.__opencli_intercepted`.
 *
 * @param patternExpr - JS expression resolving to a URL substring to match (e.g. a JSON.stringify'd string)
 * @param opts.arrayName - Global array name for captured data (default: '__opencli_intercepted')
 * @param opts.patchGuard - Global boolean name to prevent double-patching (default: '__opencli_interceptor_patched')
 */
export function generateInterceptorJs(
  patternExpr: string,
  opts: { arrayName?: string; patchGuard?: string } = {},
): string {
  const arr = opts.arrayName ?? '__opencli_intercepted';
  const guard = opts.patchGuard ?? '__opencli_interceptor_patched';

  // Store the current pattern in a separate global so it can be updated
  // without re-patching fetch/XHR (the patchGuard only prevents double-patching).
  const patternVar = `${guard}_pattern`;

  return `
    () => {
      window.${arr} = window.${arr} || [];
      window.${arr}_errors = window.${arr}_errors || [];
      window.${patternVar} = ${patternExpr};
      const __checkMatch = (url) => window.${patternVar} && url.includes(window.${patternVar});

      if (!window.${guard}) {
        // ── Patch fetch ──
        const __origFetch = window.fetch;
        window.fetch = async function(...args) {
          const reqUrl = typeof args[0] === 'string' ? args[0]
            : (args[0] && args[0].url) || '';
          const response = await __origFetch.apply(this, args);
          if (__checkMatch(reqUrl)) {
            try {
              const clone = response.clone();
              const json = await clone.json();
              window.${arr}.push(json);
            } catch(e) { window.${arr}_errors.push({ url: reqUrl, error: String(e) }); }
          }
          return response;
        };

        // ── Patch XMLHttpRequest ──
        const __XHR = XMLHttpRequest.prototype;
        const __origOpen = __XHR.open;
        const __origSend = __XHR.send;
        __XHR.open = function(method, url) {
          this.__opencli_url = String(url);
          return __origOpen.apply(this, arguments);
        };
        __XHR.send = function() {
          if (__checkMatch(this.__opencli_url)) {
            this.addEventListener('load', function() {
              try {
                window.${arr}.push(JSON.parse(this.responseText));
              } catch(e) { window.${arr}_errors.push({ url: this.__opencli_url, error: String(e) }); }
            });
          }
          return __origSend.apply(this, arguments);
        };

        window.${guard} = true;
      }
    }
  `;
}

/**
 * Generate JavaScript source to read and clear intercepted data.
 */
export function generateReadInterceptedJs(arrayName: string = '__opencli_intercepted'): string {
  return `
    () => {
      const data = window.${arrayName} || [];
      window.${arrayName} = [];
      return data;
    }
  `;
}

/**
 * Generate a self-contained tap interceptor for store-action bridge.
 * Unlike the global interceptor, this one:
 * - Installs temporarily, restores originals in finally block
 * - Resolves a promise on first capture (for immediate await)
 * - Returns captured data directly
 */
export function generateTapInterceptorJs(patternExpr: string): {
  setupVar: string;
  capturedVar: string;
  promiseVar: string;
  resolveVar: string;
  fetchPatch: string;
  xhrPatch: string;
  restorePatch: string;
} {
  return {
    setupVar: `
      let captured = null;
      let captureResolve;
      const capturePromise = new Promise(r => { captureResolve = r; });
      const capturePattern = ${patternExpr};
    `,
    capturedVar: 'captured',
    promiseVar: 'capturePromise',
    resolveVar: 'captureResolve',
    fetchPatch: `
      const origFetch = window.fetch;
      window.fetch = async function(...fetchArgs) {
        const resp = await origFetch.apply(this, fetchArgs);
        try {
          const url = typeof fetchArgs[0] === 'string' ? fetchArgs[0]
            : fetchArgs[0] instanceof Request ? fetchArgs[0].url : String(fetchArgs[0]);
          if (capturePattern && url.includes(capturePattern) && !captured) {
            try { captured = await resp.clone().json(); captureResolve(); } catch {}
          }
        } catch {}
        return resp;
      };
    `,
    xhrPatch: `
      const origXhrOpen = XMLHttpRequest.prototype.open;
      const origXhrSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__tapUrl = String(url);
        return origXhrOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        if (capturePattern && this.__tapUrl?.includes(capturePattern)) {
          this.addEventListener('load', function() {
            if (!captured) {
              try { captured = JSON.parse(this.responseText); captureResolve(); } catch {}
            }
          });
        }
        return origXhrSend.apply(this, arguments);
      };
    `,
    restorePatch: `
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origXhrOpen;
      XMLHttpRequest.prototype.send = origXhrSend;
    `,
  };
}
