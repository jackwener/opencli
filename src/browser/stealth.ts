/**
 * Stealth anti-detection module.
 *
 * Generates JS code that patches browser globals to hide automation
 * fingerprints (e.g. navigator.webdriver, missing chrome object, empty
 * plugin list). Injected before page scripts run so that websites cannot
 * detect CDP / extension-based control.
 *
 * Inspired by puppeteer-extra-plugin-stealth.
 */

/**
 * Return a self-contained JS string that, when evaluated in a page context,
 * applies all stealth patches. Safe to call multiple times — the guard flag
 * ensures patches are applied only once.
 */
export function generateStealthJs(): string {
  return `
    (() => {
      // Guard: prevent double-injection across separate CDP evaluations.
      // We cannot use a closure variable (each eval is a fresh scope), and
      // window properties / Symbols are discoverable by anti-bot scripts.
      // Instead, stash the flag in a non-enumerable getter on a built-in
      // prototype that fingerprinters are unlikely to scan.
      const _gProto = EventTarget.prototype;
      const _gKey = '__lsn';  // looks like an internal listener cache
      if (_gProto[_gKey]) return 'skipped';
      try {
        Object.defineProperty(_gProto, _gKey, { value: true, enumerable: false, configurable: true });
      } catch {}

      // 1. navigator.webdriver → false
      //    Most common check; Playwright/Puppeteer/CDP set this to true.
      //    Real Chrome returns false (not undefined) — returning undefined is
      //    itself a detection signal for advanced fingerprinters.
      try {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true,
        });
      } catch {}

      // 2. window.chrome stub
      //    Real Chrome exposes window.chrome with runtime, loadTimes, csi.
      //    Headless/automated Chrome may not have it.
      try {
        if (!window.chrome) {
          window.chrome = {
            runtime: {
              onConnect: { addListener: () => {}, removeListener: () => {} },
              onMessage: { addListener: () => {}, removeListener: () => {} },
            },
            loadTimes: () => ({}),
            csi: () => ({}),
          };
        }
      } catch {}

      // 3. navigator.plugins — fake population only if empty
      //    Real user browser already has plugins; only patch in automated/headless
      //    contexts where the list is empty (overwriting real plugins with fakes
      //    would be counterproductive and detectable).
      try {
        if (!navigator.plugins || navigator.plugins.length === 0) {
          const fakePlugins = [
            { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
            { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
            { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
            { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: '' },
          ];
          fakePlugins.item = (i) => fakePlugins[i] || null;
          fakePlugins.namedItem = (n) => fakePlugins.find(p => p.name === n) || null;
          fakePlugins.refresh = () => {};
          Object.defineProperty(navigator, 'plugins', {
            get: () => fakePlugins,
            configurable: true,
          });
        }
      } catch {}

      // 4. navigator.languages — guarantee non-empty
      //    Some automated contexts return undefined or empty array.
      try {
        if (!navigator.languages || navigator.languages.length === 0) {
          Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
            configurable: true,
          });
        }
      } catch {}

      // 5. Permissions.query — normalize notification permission
      //    Headless Chrome throws on Permissions.query({ name: 'notifications' }).
      try {
        const origQuery = window.Permissions?.prototype?.query;
        if (origQuery) {
          window.Permissions.prototype.query = function (parameters) {
            if (parameters?.name === 'notifications') {
              return Promise.resolve({ state: Notification.permission, onchange: null });
            }
            return origQuery.call(this, parameters);
          };
        }
      } catch {}

      // 6. Clean automation artifacts
      //    Remove properties left by Playwright, Puppeteer, or CDP injection.
      try {
        delete window.__playwright;
        delete window.__puppeteer;
        // ChromeDriver injects cdc_ prefixed globals; the suffix varies by version,
        // so scan window for any matching property rather than hardcoding names.
        for (const prop of Object.getOwnPropertyNames(window)) {
          if (prop.startsWith('cdc_') || prop.startsWith('__cdc_')) {
            try { delete window[prop]; } catch {}
          }
        }
      } catch {}

      // 7. CDP stack trace cleanup
      //    Runtime.evaluate injects scripts whose source URLs appear in Error
      //    stack traces (e.g. __puppeteer_evaluation_script__, pptr:, debugger://).
      //    Websites detect automation by doing: new Error().stack and inspecting it.
      //    We override the stack property getter on Error.prototype to filter them.
      //    Note: Error.prepareStackTrace is V8/Node-only and not available in
      //    browser page context, so we use a property descriptor approach instead.
      //    We use generic protocol patterns instead of product-specific names to
      //    also catch our own injected code frames without leaking identifiers.
      try {
        const _origDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
        const _cdpPatterns = [
          'puppeteer_evaluation_script',
          'pptr:',
          'debugger://',
          '__playwright',
          '__puppeteer',
        ];
        if (_origDescriptor && _origDescriptor.get) {
          Object.defineProperty(Error.prototype, 'stack', {
            get: function () {
              const raw = _origDescriptor.get.call(this);
              if (typeof raw !== 'string') return raw;
              return raw.split('\\n').filter(line =>
                !_cdpPatterns.some(p => line.includes(p))
              ).join('\\n');
            },
            configurable: true,
          });
        }
      } catch {}

      return 'applied';
    })()
  `;
}
