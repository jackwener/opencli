//#region src/protocol.ts
/** Default daemon port */
var DAEMON_PORT = 19825;
var DAEMON_HOST = "localhost";
var DAEMON_WS_URL = `ws://${DAEMON_HOST}:${DAEMON_PORT}/ext`;
/** Lightweight health-check endpoint — probed before each WebSocket attempt. */
var DAEMON_PING_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}/ping`;
/** Base reconnect delay for extension WebSocket (ms) */
var WS_RECONNECT_BASE_DELAY = 2e3;
/** Max reconnect delay (ms) — kept short since daemon is long-lived */
var WS_RECONNECT_MAX_DELAY = 5e3;
//#endregion
//#region src/cdp.ts
/**
* CDP execution via chrome.debugger API.
*
* chrome.debugger only needs the "debugger" permission — no host_permissions.
* It can attach to any http/https tab. Avoid chrome:// and chrome-extension://
* tabs (resolveTabId in background.ts filters them).
*/
var attached = /* @__PURE__ */ new Set();
var networkCaptures = /* @__PURE__ */ new Map();
/** Check if a URL can be attached via CDP — only allow http(s) and blank pages. */
function isDebuggableUrl$1(url) {
	if (!url) return true;
	return url.startsWith("http://") || url.startsWith("https://") || url === "about:blank" || url.startsWith("data:");
}
async function ensureAttached(tabId, aggressiveRetry = false) {
	try {
		const tab = await chrome.tabs.get(tabId);
		if (!isDebuggableUrl$1(tab.url)) {
			attached.delete(tabId);
			throw new Error(`Cannot debug tab ${tabId}: URL is ${tab.url ?? "unknown"}`);
		}
	} catch (e) {
		if (e instanceof Error && e.message.startsWith("Cannot debug tab")) throw e;
		attached.delete(tabId);
		throw new Error(`Tab ${tabId} no longer exists`);
	}
	if (attached.has(tabId)) try {
		await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
			expression: "1",
			returnByValue: true
		});
		return;
	} catch {
		attached.delete(tabId);
	}
	const MAX_ATTACH_RETRIES = aggressiveRetry ? 5 : 2;
	const RETRY_DELAY_MS = aggressiveRetry ? 1500 : 500;
	let lastError = "";
	for (let attempt = 1; attempt <= MAX_ATTACH_RETRIES; attempt++) try {
		try {
			await chrome.debugger.detach({ tabId });
		} catch {}
		await chrome.debugger.attach({ tabId }, "1.3");
		lastError = "";
		break;
	} catch (e) {
		lastError = e instanceof Error ? e.message : String(e);
		if (attempt < MAX_ATTACH_RETRIES) {
			console.warn(`[opencli] attach attempt ${attempt}/${MAX_ATTACH_RETRIES} failed: ${lastError}, retrying in ${RETRY_DELAY_MS}ms...`);
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
			try {
				const tab = await chrome.tabs.get(tabId);
				if (!isDebuggableUrl$1(tab.url)) {
					lastError = `Tab URL changed to ${tab.url} during retry`;
					break;
				}
			} catch {
				lastError = `Tab ${tabId} no longer exists`;
			}
		}
	}
	if (lastError) {
		let finalUrl = "unknown";
		let finalWindowId = "unknown";
		try {
			const tab = await chrome.tabs.get(tabId);
			finalUrl = tab.url ?? "undefined";
			finalWindowId = String(tab.windowId);
		} catch {}
		console.warn(`[opencli] attach failed for tab ${tabId}: url=${finalUrl}, windowId=${finalWindowId}, error=${lastError}`);
		const hint = lastError.includes("chrome-extension://") ? ". Tip: another Chrome extension may be interfering — try disabling other extensions" : "";
		throw new Error(`attach failed: ${lastError}${hint}`);
	}
	attached.add(tabId);
	try {
		await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
	} catch {}
}
async function evaluate(tabId, expression, aggressiveRetry = false) {
	const MAX_EVAL_RETRIES = aggressiveRetry ? 3 : 2;
	for (let attempt = 1; attempt <= MAX_EVAL_RETRIES; attempt++) try {
		await ensureAttached(tabId, aggressiveRetry);
		const result = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true
		});
		if (result.exceptionDetails) {
			const errMsg = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Eval error";
			throw new Error(errMsg);
		}
		return result.result?.value;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const isNavigateError = msg.includes("Inspected target navigated") || msg.includes("Target closed");
		if ((isNavigateError || msg.includes("attach failed") || msg.includes("Debugger is not attached") || msg.includes("chrome-extension://")) && attempt < MAX_EVAL_RETRIES) {
			attached.delete(tabId);
			const retryMs = isNavigateError ? 200 : 500;
			await new Promise((resolve) => setTimeout(resolve, retryMs));
			continue;
		}
		throw e;
	}
	throw new Error("evaluate: max retries exhausted");
}
var evaluateAsync = evaluate;
/**
* Capture a screenshot via CDP Page.captureScreenshot.
* Returns base64-encoded image data.
*/
async function screenshot(tabId, options = {}) {
	await ensureAttached(tabId);
	const format = options.format ?? "png";
	if (options.fullPage) {
		const metrics = await chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics");
		const size = metrics.cssContentSize || metrics.contentSize;
		if (size) await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
			mobile: false,
			width: Math.ceil(size.width),
			height: Math.ceil(size.height),
			deviceScaleFactor: 1
		});
	}
	try {
		const params = { format };
		if (format === "jpeg" && options.quality !== void 0) params.quality = Math.max(0, Math.min(100, options.quality));
		return (await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", params)).data;
	} finally {
		if (options.fullPage) await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride").catch(() => {});
	}
}
/**
* Set local file paths on a file input element via CDP DOM.setFileInputFiles.
* This bypasses the need to send large base64 payloads through the message channel —
* Chrome reads the files directly from the local filesystem.
*
* @param tabId - Target tab ID
* @param files - Array of absolute local file paths
* @param selector - CSS selector to find the file input (optional, defaults to first file input)
*/
async function setFileInputFiles(tabId, files, selector) {
	await ensureAttached(tabId);
	await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
	const doc = await chrome.debugger.sendCommand({ tabId }, "DOM.getDocument");
	const query = selector || "input[type=\"file\"]";
	const result = await chrome.debugger.sendCommand({ tabId }, "DOM.querySelector", {
		nodeId: doc.root.nodeId,
		selector: query
	});
	if (!result.nodeId) throw new Error(`No element found matching selector: ${query}`);
	await chrome.debugger.sendCommand({ tabId }, "DOM.setFileInputFiles", {
		files,
		nodeId: result.nodeId
	});
}
async function insertText(tabId, text) {
	await ensureAttached(tabId);
	await chrome.debugger.sendCommand({ tabId }, "Input.insertText", { text });
}
function normalizeCapturePatterns(pattern) {
	return String(pattern || "").split("|").map((part) => part.trim()).filter(Boolean);
}
function shouldCaptureUrl(url, patterns) {
	if (!url) return false;
	if (!patterns.length) return true;
	return patterns.some((pattern) => url.includes(pattern));
}
function normalizeHeaders(headers) {
	if (!headers || typeof headers !== "object") return {};
	const out = {};
	for (const [key, value] of Object.entries(headers)) out[String(key)] = String(value);
	return out;
}
function getOrCreateNetworkCaptureEntry(tabId, requestId, fallback) {
	const state = networkCaptures.get(tabId);
	if (!state) return null;
	const existingIndex = state.requestToIndex.get(requestId);
	if (existingIndex !== void 0) return state.entries[existingIndex] || null;
	const url = fallback?.url || "";
	if (!shouldCaptureUrl(url, state.patterns)) return null;
	const entry = {
		kind: "cdp",
		url,
		method: fallback?.method || "GET",
		requestHeaders: fallback?.requestHeaders || {},
		timestamp: Date.now()
	};
	state.entries.push(entry);
	state.requestToIndex.set(requestId, state.entries.length - 1);
	return entry;
}
async function startNetworkCapture(tabId, pattern) {
	await ensureAttached(tabId);
	await chrome.debugger.sendCommand({ tabId }, "Network.enable");
	networkCaptures.set(tabId, {
		patterns: normalizeCapturePatterns(pattern),
		entries: [],
		requestToIndex: /* @__PURE__ */ new Map()
	});
}
async function readNetworkCapture(tabId) {
	const state = networkCaptures.get(tabId);
	if (!state) return [];
	const entries = state.entries.slice();
	state.entries = [];
	state.requestToIndex.clear();
	return entries;
}
async function detach(tabId) {
	if (!attached.has(tabId)) return;
	attached.delete(tabId);
	networkCaptures.delete(tabId);
	try {
		await chrome.debugger.detach({ tabId });
	} catch {}
}
function registerListeners() {
	chrome.tabs.onRemoved.addListener((tabId) => {
		attached.delete(tabId);
		networkCaptures.delete(tabId);
	});
	chrome.debugger.onDetach.addListener((source) => {
		if (source.tabId) {
			attached.delete(source.tabId);
			networkCaptures.delete(source.tabId);
		}
	});
	chrome.tabs.onUpdated.addListener(async (tabId, info) => {
		if (info.url && !isDebuggableUrl$1(info.url)) await detach(tabId);
	});
	chrome.debugger.onEvent.addListener(async (source, method, params) => {
		const tabId = source.tabId;
		if (!tabId) return;
		const state = networkCaptures.get(tabId);
		if (!state) return;
		if (method === "Network.requestWillBeSent") {
			const requestId = String(params?.requestId || "");
			const request = params?.request;
			const entry = getOrCreateNetworkCaptureEntry(tabId, requestId, {
				url: request?.url,
				method: request?.method,
				requestHeaders: normalizeHeaders(request?.headers)
			});
			if (!entry) return;
			entry.requestBodyKind = request?.hasPostData ? "string" : "empty";
			entry.requestBodyPreview = String(request?.postData || "").slice(0, 4e3);
			try {
				const postData = await chrome.debugger.sendCommand({ tabId }, "Network.getRequestPostData", { requestId });
				if (postData?.postData) {
					entry.requestBodyKind = "string";
					entry.requestBodyPreview = postData.postData.slice(0, 4e3);
				}
			} catch {}
			return;
		}
		if (method === "Network.responseReceived") {
			const requestId = String(params?.requestId || "");
			const response = params?.response;
			const entry = getOrCreateNetworkCaptureEntry(tabId, requestId, { url: response?.url });
			if (!entry) return;
			entry.responseStatus = response?.status;
			entry.responseContentType = response?.mimeType || "";
			entry.responseHeaders = normalizeHeaders(response?.headers);
			return;
		}
		if (method === "Network.loadingFinished") {
			const requestId = String(params?.requestId || "");
			const stateEntryIndex = state.requestToIndex.get(requestId);
			if (stateEntryIndex === void 0) return;
			const entry = state.entries[stateEntryIndex];
			if (!entry) return;
			try {
				const body = await chrome.debugger.sendCommand({ tabId }, "Network.getResponseBody", { requestId });
				if (typeof body?.body === "string") entry.responsePreview = body.base64Encoded ? `base64:${body.body.slice(0, 4e3)}` : body.body.slice(0, 4e3);
			} catch {}
		}
	});
}
//#endregion
//#region src/identity.ts
/**
* Page identity mapping — targetId ↔ tabId.
*
* targetId is the cross-layer page identity (CDP target UUID).
* tabId is an internal Chrome Tabs API routing detail — never exposed outside the extension.
*
* Lifecycle:
*   - Cache populated lazily via chrome.debugger.getTargets()
*   - Evicted on tab close (chrome.tabs.onRemoved)
*   - Miss triggers full refresh; refresh miss → hard error (no guessing)
*/
var targetToTab = /* @__PURE__ */ new Map();
var tabToTarget = /* @__PURE__ */ new Map();
/**
* Resolve targetId for a given tabId.
* Returns cached value if available; on miss, refreshes from chrome.debugger.getTargets().
* Throws if no targetId can be found (page may have been destroyed).
*/
async function resolveTargetId(tabId) {
	const cached = tabToTarget.get(tabId);
	if (cached) return cached;
	await refreshMappings();
	const result = tabToTarget.get(tabId);
	if (!result) throw new Error(`No targetId for tab ${tabId} — page may have been closed`);
	return result;
}
/**
* Resolve tabId for a given targetId.
* Returns cached value if available; on miss, refreshes from chrome.debugger.getTargets().
* Throws if no tabId can be found — never falls back to guessing.
*/
async function resolveTabId$1(targetId) {
	const cached = targetToTab.get(targetId);
	if (cached !== void 0) return cached;
	await refreshMappings();
	const result = targetToTab.get(targetId);
	if (result === void 0) throw new Error(`Page not found: ${targetId} — stale page identity`);
	return result;
}
/**
* Remove mappings for a closed tab.
* Called from chrome.tabs.onRemoved listener.
*/
function evictTab(tabId) {
	const targetId = tabToTarget.get(tabId);
	if (targetId) targetToTab.delete(targetId);
	tabToTarget.delete(tabId);
}
/**
* Full refresh of targetId ↔ tabId mappings from chrome.debugger.getTargets().
*/
async function refreshMappings() {
	const targets = await chrome.debugger.getTargets();
	targetToTab.clear();
	tabToTarget.clear();
	for (const t of targets) if (t.type === "page" && t.tabId !== void 0) {
		targetToTab.set(t.id, t.tabId);
		tabToTarget.set(t.tabId, t.id);
	}
}
//#endregion
//#region ../src/browser/dom-snapshot.ts
/**
* Generate JavaScript code that, when evaluated in a page context via CDP
* Runtime.evaluate, returns a pruned DOM snapshot string optimised for LLMs.
*
* The snapshot output format:
*   [42]<button type=submit>Search</button>
*   |scroll|<div> (0.5↑ 3.2↓)
*     *[58]<a href=/r/1>Result 1</a>
*     [59]<a href=/r/2>Result 2</a>
*
* - `[id]` — interactive element with backend index for targeting
* - `*` prefix — newly appeared element (incremental diff)
* - `|scroll|` — scrollable container with page counts
* - `|shadow|` — Shadow DOM boundary
* - `|iframe|` — iframe content
* - `|table|` — markdown table rendering
*/
function generateSnapshotJs(opts = {}) {
	const viewportExpand = opts.viewportExpand ?? 800;
	const maxDepth = Math.max(1, Math.min(opts.maxDepth ?? 50, 200));
	const interactiveOnly = opts.interactiveOnly ?? false;
	const maxTextLength = opts.maxTextLength ?? 120;
	const includeScrollInfo = opts.includeScrollInfo ?? true;
	const bboxDedup = opts.bboxDedup ?? true;
	const includeShadowDom = opts.includeShadowDom ?? true;
	const includeIframes = opts.includeIframes ?? true;
	const maxIframes = opts.maxIframes ?? 5;
	const paintOrderCheck = opts.paintOrderCheck ?? true;
	const annotateRefs = opts.annotateRefs ?? true;
	const reportHidden = opts.reportHidden ?? true;
	const filterAds = opts.filterAds ?? true;
	const markdownTables = opts.markdownTables ?? true;
	const previousHashes = opts.previousHashes ?? null;
	return `
(() => {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────
  const VIEWPORT_EXPAND = ${viewportExpand};
  const MAX_DEPTH = ${maxDepth};
  const INTERACTIVE_ONLY = ${interactiveOnly};
  const MAX_TEXT_LEN = ${maxTextLength};
  const INCLUDE_SCROLL_INFO = ${includeScrollInfo};
  const BBOX_DEDUP = ${bboxDedup};
  const INCLUDE_SHADOW_DOM = ${includeShadowDom};
  const INCLUDE_IFRAMES = ${includeIframes};
  const MAX_IFRAMES = ${maxIframes};
  const PAINT_ORDER_CHECK = ${paintOrderCheck};
  const ANNOTATE_REFS = ${annotateRefs};
  const REPORT_HIDDEN = ${reportHidden};
  const FILTER_ADS = ${filterAds};
  const MARKDOWN_TABLES = ${markdownTables};
  const PREV_HASHES = ${previousHashes ? `new Set(${previousHashes})` : "null"};

  // ── Constants ──────────────────────────────────────────────────────

  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'link', 'meta', 'head',
    'template', 'br', 'wbr', 'col', 'colgroup',
  ]);

  const SVG_CHILDREN = new Set([
    'path', 'rect', 'g', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'use', 'defs', 'clippath', 'mask', 'pattern',
    'text', 'tspan', 'lineargradient', 'radialgradient', 'stop',
    'filter', 'fegaussianblur', 'fecolormatrix', 'feblend',
    'symbol', 'marker', 'foreignobject', 'desc', 'title',
  ]);

  const INTERACTIVE_TAGS = new Set([
    'a', 'button', 'input', 'select', 'textarea', 'details',
    'summary', 'option', 'optgroup',
  ]);

  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'menuitem', 'option', 'radio', 'checkbox',
    'tab', 'textbox', 'combobox', 'slider', 'spinbutton',
    'searchbox', 'switch', 'menuitemcheckbox', 'menuitemradio',
    'treeitem', 'gridcell', 'row',
  ]);

  const LANDMARK_ROLES = new Set([
    'main', 'navigation', 'banner', 'search', 'region',
    'complementary', 'contentinfo', 'form', 'dialog',
  ]);

  const LANDMARK_TAGS = new Set([
    'nav', 'main', 'header', 'footer', 'aside', 'form',
    'search', 'dialog', 'section', 'article',
  ]);

  const ATTR_WHITELIST = new Set([
    'id', 'name', 'type', 'value', 'placeholder', 'title', 'alt',
    'role', 'aria-label', 'aria-expanded', 'aria-checked', 'aria-selected',
    'aria-disabled', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow',
    'aria-haspopup', 'aria-live', 'aria-required',
    'href', 'src', 'action', 'method', 'for', 'checked', 'selected',
    'disabled', 'required', 'multiple', 'accept', 'min', 'max',
    'pattern', 'maxlength', 'minlength', 'data-testid', 'data-test',
    'contenteditable', 'tabindex', 'autocomplete',
  ]);

  const PROPAGATING_TAGS = new Set(['a', 'button']);

  const AD_PATTERNS = [
    'googleadservices.com', 'doubleclick.net', 'googlesyndication.com',
    'facebook.com/tr', 'analytics.google.com', 'connect.facebook.net',
    'ad.doubleclick', 'pagead', 'adsense',
  ];

  const AD_SELECTOR_RE = /\\b(ad[_-]?(?:banner|container|wrapper|slot|unit|block|frame|leaderboard|sidebar)|google[_-]?ad|sponsored|adsbygoogle|banner[_-]?ad)\\b/i;

  // Search element indicators for heuristic detection
  const SEARCH_INDICATORS = new Set([
    'search', 'magnify', 'glass', 'lookup', 'find', 'query',
    'search-icon', 'search-btn', 'search-button', 'searchbox',
    'fa-search', 'icon-search', 'btn-search',
  ]);

  // ── Viewport & Layout Helpers ──────────────────────────────────────

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  function isInExpandedViewport(rect) {
    if (!rect || (rect.width === 0 && rect.height === 0)) return false;
    return rect.bottom > -VIEWPORT_EXPAND && rect.top < vh + VIEWPORT_EXPAND &&
           rect.right > -VIEWPORT_EXPAND && rect.left < vw + VIEWPORT_EXPAND;
  }

  function isVisibleByCSS(el) {
    const style = el.style;
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (style.opacity === '0') return false;
    try {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none') return false;
      if (cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) <= 0) return false;
      if (cs.clip === 'rect(0px, 0px, 0px, 0px)' && cs.position === 'absolute') return false;
      if (cs.overflow === 'hidden' && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    } catch {}
    return true;
  }

  // ── Paint Order Occlusion ──────────────────────────────────────────

  function isOccludedByOverlay(el) {
    if (!PAINT_ORDER_CHECK) return false;
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx < 0 || cy < 0 || cx > vw || cy > vh) return false;
      const topEl = document.elementFromPoint(cx, cy);
      if (!topEl || topEl === el || el.contains(topEl) || topEl.contains(el)) return false;
      const cs = window.getComputedStyle(topEl);
      if (parseFloat(cs.opacity) < 0.5) return false;
      const bg = cs.backgroundColor;
      if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false;
      return true;
    } catch { return false; }
  }

  // ── Ad/Noise Detection ─────────────────────────────────────────────

  function isAdElement(el) {
    if (!FILTER_ADS) return false;
    try {
      const id = el.id || '';
      const cls = el.className || '';
      const testStr = id + ' ' + (typeof cls === 'string' ? cls : '');
      if (AD_SELECTOR_RE.test(testStr)) return true;
      if (el.tagName === 'IFRAME') {
        const src = el.src || '';
        for (const p of AD_PATTERNS) { if (src.includes(p)) return true; }
      }
      if (el.hasAttribute('data-ad') || el.hasAttribute('data-ad-slot') ||
          el.hasAttribute('data-adunit') || el.hasAttribute('data-google-query-id')) return true;
    } catch {}
    return false;
  }

  // ── Interactivity Detection ────────────────────────────────────────

  // Check if element contains a form control within limited depth (handles label/span wrappers)
  function hasFormControlDescendant(el, maxDepth = 2) {
    if (maxDepth <= 0) return false;
    for (const child of el.children || []) {
      const tag = child.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return true;
      if (hasFormControlDescendant(child, maxDepth - 1)) return true;
    }
    return false;
  }

  function isInteractive(el) {
    const tag = el.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(tag)) {
      // Skip labels that proxy via "for" to avoid double-activating external inputs
      if (tag === 'label') {
        if (el.hasAttribute('for')) return false;
        // Detect labels that wrap form controls up to two levels deep (label > span > input)
        if (hasFormControlDescendant(el, 2)) return true;
      }
      if (el.disabled && (tag === 'button' || tag === 'input')) return false;
      return true;
    }
    // Span wrappers for UI components - check if they contain form controls
    if (tag === 'span') {
      if (hasFormControlDescendant(el, 2)) return true;
    }
    const role = el.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('onmousedown') || el.hasAttribute('ontouchstart')) return true;
    if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') return true;
    // Framework event listener detection (React/Vue/Angular onClick)
    if (hasFrameworkListener(el)) return true;
    try { if (window.getComputedStyle(el).cursor === 'pointer') return true; } catch {}
    if (el.isContentEditable && el.getAttribute('contenteditable') !== 'false') return true;
    // Search element heuristic detection
    if (isSearchElement(el)) return true;
    return false;
  }

  function hasFrameworkListener(el) {
    try {
      // React: __reactProps$xxx / __reactEvents$xxx with onClick/onMouseDown
      for (const key of Object.keys(el)) {
        if (key.startsWith('__reactProps$') || key.startsWith('__reactEvents$')) {
          const props = el[key];
          if (props && (props.onClick || props.onMouseDown || props.onPointerDown)) return true;
        }
      }
      // Vue 3: _vei (Vue Event Invoker) with onClick
      if (el._vei && (el._vei.onClick || el._vei.click || el._vei.onMousedown)) return true;
      // Vue 2: __vue__ instance with $listeners
      if (el.__vue__?.$listeners?.click) return true;
      // Angular: ng-reflect-click binding
      if (el.hasAttribute('ng-reflect-click')) return true;
    } catch { /* ignore errors from cross-origin or frozen objects */ }
    return false;
  }

  function isSearchElement(el) {
    // Check class names for search indicators
    // Note: SVG elements have className as SVGAnimatedString (not a string), use baseVal
    const className = (typeof el.className === 'string' ? el.className : el.className?.baseVal || '').toLowerCase();
    const classes = className.split(/\\s+/).filter(Boolean);
    for (const cls of classes) {
      const cleaned = cls.replace(/[^a-z0-9-]/g, '');
      if (SEARCH_INDICATORS.has(cleaned)) return true;
    }
    // Check id for search indicators
    const id = el.id?.toLowerCase() || '';
    const cleanedId = id.replace(/[^a-z0-9-]/g, '');
    if (SEARCH_INDICATORS.has(cleanedId)) return true;
    // Check data-* attributes for search functionality
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith('data-')) {
        const value = attr.value.toLowerCase();
        for (const kw of SEARCH_INDICATORS) {
          if (value.includes(kw)) return true;
        }
      }
    }
    return false;
  }

  function isLandmark(el) {
    const role = el.getAttribute('role');
    if (role && LANDMARK_ROLES.has(role)) return true;
    return LANDMARK_TAGS.has(el.tagName.toLowerCase());
  }

  // ── Scrollability Detection ────────────────────────────────────────

  function getScrollInfo(el) {
    if (!INCLUDE_SCROLL_INFO) return null;
    const sh = el.scrollHeight, ch = el.clientHeight;
    const sw = el.scrollWidth, cw = el.clientWidth;
    const isV = sh > ch + 5, isH = sw > cw + 5;
    if (!isV && !isH) return null;
    try {
      const cs = window.getComputedStyle(el);
      const scrollable = ['auto', 'scroll', 'overlay'];
      const tag = el.tagName.toLowerCase();
      const isBody = tag === 'body' || tag === 'html';
      if (isV && !isBody && !scrollable.includes(cs.overflowY)) return null;
      const info = {};
      if (isV) {
        const above = ch > 0 ? +(el.scrollTop / ch).toFixed(1) : 0;
        const below = ch > 0 ? +((sh - ch - el.scrollTop) / ch).toFixed(1) : 0;
        if (above > 0 || below > 0) info.v = { above, below };
      }
      if (isH && scrollable.includes(cs.overflowX)) {
        info.h = { pct: cw > 0 ? Math.round(el.scrollLeft / (sw - cw) * 100) : 0 };
      }
      return Object.keys(info).length > 0 ? info : null;
    } catch { return null; }
  }

  // ── BBox Containment Check ─────────────────────────────────────────

  function isContainedBy(childRect, parentRect, threshold) {
    if (!childRect || !parentRect) return false;
    const cArea = childRect.width * childRect.height;
    if (cArea === 0) return false;
    const xO = Math.max(0, Math.min(childRect.right, parentRect.right) - Math.max(childRect.left, parentRect.left));
    const yO = Math.max(0, Math.min(childRect.bottom, parentRect.bottom) - Math.max(childRect.top, parentRect.top));
    return (xO * yO) / cArea >= threshold;
  }

  // ── Text Helpers ───────────────────────────────────────────────────

  function getDirectText(el) {
    let text = '';
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        const t = child.textContent.trim();
        if (t) text += (text ? ' ' : '') + t;
      }
    }
    return text;
  }

  function capText(s) {
    if (!s) return '';
    const t = s.replace(/\\s+/g, ' ').trim();
    return t.length > MAX_TEXT_LEN ? t.slice(0, MAX_TEXT_LEN) + '…' : t;
  }

  // ── Element Hashing (for incremental diff) ─────────────────────────

  function hashElement(el) {
    // Simple hash: tag + id + className + textContent prefix
    const tag = el.tagName || '';
    const id = el.id || '';
    const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 50);
    const text = (el.textContent || '').trim().slice(0, 40);
    const s = tag + '|' + id + '|' + cls + '|' + text;
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return '' + (h >>> 0); // unsigned
  }

  // ── Attribute Serialization ────────────────────────────────────────

  function serializeAttrs(el) {
    const parts = [];
    for (const attr of el.attributes) {
      if (!ATTR_WHITELIST.has(attr.name)) continue;
      let val = attr.value.trim();
      if (!val) continue;
      if (val.length > 120) val = val.slice(0, 100) + '…';
      if (attr.name === 'type' && val.toLowerCase() === el.tagName.toLowerCase()) continue;
      if (attr.name === 'value' && el.getAttribute('type') === 'password') { parts.push('value=••••'); continue; }
      if (attr.name === 'href') {
        if (val.startsWith('javascript:')) continue;
        try {
          const u = new URL(val, location.origin);
          if (u.origin === location.origin) val = u.pathname + u.search + u.hash;
        } catch {}
      }
      parts.push(attr.name + '=' + val);
    }
    // Synthetic attributes
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      const fmts = { 'date':'YYYY-MM-DD', 'time':'HH:MM', 'datetime-local':'YYYY-MM-DDTHH:MM', 'month':'YYYY-MM', 'week':'YYYY-W##' };
      if (fmts[type]) parts.push('format=' + fmts[type]);
      if (['text','email','tel','url','search','number','date','time','datetime-local','month','week'].includes(type)) {
        if (el.value && !parts.some(p => p.startsWith('value='))) parts.push('value=' + capText(el.value));
      }
      if (type === 'password' && el.value && !parts.some(p => p.startsWith('value='))) parts.push('value=••••');
      if ((type === 'checkbox' || type === 'radio') && el.checked && !parts.some(p => p.startsWith('checked'))) parts.push('checked');
      if (type === 'file' && el.files && el.files.length > 0) parts.push('files=' + Array.from(el.files).map(f => f.name).join(','));
    }
    if (tag === 'TEXTAREA' && el.value && !parts.some(p => p.startsWith('value='))) parts.push('value=' + capText(el.value));
    if (tag === 'SELECT') {
      const sel = el.options?.[el.selectedIndex];
      if (sel && !parts.some(p => p.startsWith('value='))) parts.push('value=' + capText(sel.textContent));
      const optEls = Array.from(el.options || []).slice(0, 6);
      if (optEls.length > 0) {
        const ot = optEls.map(o => capText(o.textContent).slice(0, 30));
        if (el.options.length > 6) ot.push('…' + (el.options.length - 6) + ' more');
        parts.push('options=[' + ot.join('|') + ']');
      }
    }
    return parts.join(' ');
  }

  // ── Table → Markdown Serialization ─────────────────────────────────

  function serializeTable(table, depth) {
    if (!MARKDOWN_TABLES) return false;
    try {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0 || rows.length > 50) return false; // skip huge tables
      const grid = [];
      let maxCols = 0;
      for (const row of rows) {
        const cells = [];
        for (const cell of row.querySelectorAll('th, td')) {
          let text = capText(cell.textContent || '');
          // Include interactive elements in cells
          const links = cell.querySelectorAll('a[href]');
          if (links.length === 1 && text) {
            const href = links[0].getAttribute('href');
            if (href && !href.startsWith('javascript:')) {
              try {
                const u = new URL(href, location.origin);
                text = '[' + text + '](' + (u.origin === location.origin ? u.pathname + u.search : href) + ')';
              } catch { text = '[' + text + '](' + href + ')'; }
            }
          }
          cells.push(text || '');
        }
        if (cells.length > 0) {
          grid.push(cells);
          if (cells.length > maxCols) maxCols = cells.length;
        }
      }
      if (grid.length < 2 || maxCols === 0) return false; // need at least header + 1 row
      // Pad rows to maxCols
      for (const row of grid) { while (row.length < maxCols) row.push(''); }
      // Compute column widths
      const widths = [];
      for (let c = 0; c < maxCols; c++) {
        let w = 3;
        for (const row of grid) { if (row[c].length > w) w = Math.min(row[c].length, 40); }
        widths.push(w);
      }
      const indent = '  '.repeat(depth);
      const tableLines = [];
      // Header
      tableLines.push(indent + '| ' + grid[0].map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |');
      tableLines.push(indent + '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |');
      // Body
      for (let r = 1; r < grid.length; r++) {
        tableLines.push(indent + '| ' + grid[r].map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |');
      }
      return tableLines;
    } catch { return false; }
  }

  // ── Main Tree Walk ─────────────────────────────────────────────────

  let interactiveIndex = 0;
  const lines = [];
  const hiddenInteractives = [];
  const currentHashes = [];
  let iframeCount = 0;

  function walk(el, depth, parentPropagatingRect) {
    if (depth > MAX_DEPTH) return false;
    if (el.nodeType !== 1) return false;

    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return false;
    if (isAdElement(el)) return false;

    // SVG: emit tag, collapse children
    if (tag === 'svg') {
      const attrs = serializeAttrs(el);
      const interactive = isInteractive(el);
      let prefix = '';
      if (interactive) {
        interactiveIndex++;
        if (ANNOTATE_REFS) el.setAttribute('data-opencli-ref', '' + interactiveIndex);
        prefix = '[' + interactiveIndex + ']';
      }
      lines.push('  '.repeat(depth) + prefix + '<svg' + (attrs ? ' ' + attrs : '') + ' />');
      return interactive;
    }
    if (SVG_CHILDREN.has(tag)) return false;

    // Table: try markdown serialization before generic walk
    if (tag === 'table' && MARKDOWN_TABLES) {
      const tableLines = serializeTable(el, depth);
      if (tableLines) {
        const indent = '  '.repeat(depth);
        lines.push(indent + '|table|');
        for (const tl of tableLines) lines.push(tl);
        return false; // tables usually non-interactive
      }
      // Fall through to generic walk if markdown failed
    }

    // iframe handling
    if (tag === 'iframe' && INCLUDE_IFRAMES && iframeCount < MAX_IFRAMES) {
      return walkIframe(el, depth);
    }

    // Visibility check
    let rect;
    try { rect = el.getBoundingClientRect(); } catch { return false; }
    const hasArea = rect.width > 0 && rect.height > 0;
    if (hasArea && !isVisibleByCSS(el)) {
      if (!(tag === 'input' && el.type === 'file')) return false;
    }

    const interactive = isInteractive(el);

    // Viewport threshold pruning
    if (hasArea && !isInExpandedViewport(rect)) {
      if (interactive && REPORT_HIDDEN) {
        const scrollDist = rect.top > vh ? rect.top - vh : -rect.bottom;
        const pagesAway = Math.abs(scrollDist / vh).toFixed(1);
        const direction = rect.top > vh ? 'below' : 'above';
        const text = capText(getDirectText(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '');
        hiddenInteractives.push({ tag, text, direction, pagesAway });
      }
      return false;
    }

    // Paint order occlusion
    if (interactive && hasArea && isOccludedByOverlay(el)) return false;

    const landmark = isLandmark(el);
    const scrollInfo = getScrollInfo(el);
    const isScrollable = scrollInfo !== null;

    // BBox dedup
    let excludedByParent = false;
    if (BBOX_DEDUP && parentPropagatingRect && !interactive) {
      if (hasArea && isContainedBy(rect, parentPropagatingRect, 0.95)) {
        const hasSemantic = el.hasAttribute('aria-label') ||
          (el.getAttribute('role') && INTERACTIVE_ROLES.has(el.getAttribute('role')));
        if (!hasSemantic && !['input','select','textarea','label'].includes(tag)) {
          excludedByParent = true;
        }
      }
    }

    let propagateRect = parentPropagatingRect;
    if (BBOX_DEDUP && PROPAGATING_TAGS.has(tag) && hasArea) propagateRect = rect;

    // Process children
    const origLen = lines.length;
    let hasInteractiveDescendant = false;

    for (const child of el.children) {
      const r = walk(child, depth + 1, propagateRect);
      if (r) hasInteractiveDescendant = true;
    }

    // Shadow DOM
    if (INCLUDE_SHADOW_DOM && el.shadowRoot) {
      const shadowOrigLen = lines.length;
      for (const child of el.shadowRoot.children) {
        const r = walk(child, depth + 1, propagateRect);
        if (r) hasInteractiveDescendant = true;
      }
      if (lines.length > shadowOrigLen) {
        lines.splice(shadowOrigLen, 0, '  '.repeat(depth + 1) + '|shadow|');
      }
    }

    const childLinesCount = lines.length - origLen;
    const text = capText(getDirectText(el));

    // Decide whether to emit
    if (INTERACTIVE_ONLY && !interactive && !landmark && !hasInteractiveDescendant && !text) {
      lines.length = origLen;
      return false;
    }
    if (excludedByParent && !interactive && !isScrollable) return hasInteractiveDescendant;
    if (!interactive && !isScrollable && !text && childLinesCount === 0 && !landmark) return false;

    // ── Emit node ────────────────────────────────────────────────────
    const indent = '  '.repeat(depth);
    let line = indent;

    // Incremental diff: mark new elements with *
    if (PREV_HASHES) {
      const h = hashElement(el);
      currentHashes.push(h);
      if (!PREV_HASHES.has(h)) line += '*';
    } else {
      currentHashes.push(hashElement(el));
    }

    // Scroll marker
    if (isScrollable && !interactive) line += '|scroll|';

    // Interactive index + data-ref
    if (interactive) {
      interactiveIndex++;
      if (ANNOTATE_REFS) el.setAttribute('data-opencli-ref', '' + interactiveIndex);
      line += isScrollable ? '|scroll[' + interactiveIndex + ']|' : '[' + interactiveIndex + ']';
    }

    // Tag + attributes
    const attrs = serializeAttrs(el);
    line += '<' + tag;
    if (attrs) line += ' ' + attrs;

    // Scroll info suffix, inline text, or self-close
    if (isScrollable && scrollInfo) {
      const parts = [];
      if (scrollInfo.v) parts.push(scrollInfo.v.above + '↑ ' + scrollInfo.v.below + '↓');
      if (scrollInfo.h) parts.push('h:' + scrollInfo.h.pct + '%');
      line += ' /> (' + parts.join(', ') + ')';
    } else if (text && childLinesCount === 0) {
      line += '>' + text + '</' + tag + '>';
    } else {
      line += ' />';
    }

    lines.splice(origLen, 0, line);
    if (text && childLinesCount > 0) lines.splice(origLen + 1, 0, indent + '  ' + text);

    return interactive || hasInteractiveDescendant;
  }

  // ── iframe Processing ──────────────────────────────────────────────

  function walkIframe(el, depth) {
    const indent = '  '.repeat(depth);
    try {
      const doc = el.contentDocument;
      if (!doc || !doc.body) {
        const attrs = serializeAttrs(el);
        lines.push(indent + '|iframe|<iframe' + (attrs ? ' ' + attrs : '') + ' /> (cross-origin)');
        return false;
      }
      iframeCount++;
      const attrs = serializeAttrs(el);
      lines.push(indent + '|iframe|<iframe' + (attrs ? ' ' + attrs : '') + ' />');
      let has = false;
      for (const child of doc.body.children) {
        if (walk(child, depth + 1, null)) has = true;
      }
      return has;
    } catch {
      const attrs = serializeAttrs(el);
      lines.push(indent + '|iframe|<iframe' + (attrs ? ' ' + attrs : '') + ' /> (blocked)');
      return false;
    }
  }

  // ── Entry Point ────────────────────────────────────────────────────

  lines.push('url: ' + location.href);
  lines.push('title: ' + document.title);
  lines.push('viewport: ' + vw + 'x' + vh);
  const pageScrollInfo = getScrollInfo(document.documentElement) || getScrollInfo(document.body);
  if (pageScrollInfo && pageScrollInfo.v) {
    lines.push('page_scroll: ' + pageScrollInfo.v.above + '↑ ' + pageScrollInfo.v.below + '↓');
  }
  lines.push('---');

  const root = document.body || document.documentElement;
  if (root) walk(root, 0, null);

  // Hidden interactive elements hint
  if (REPORT_HIDDEN && hiddenInteractives.length > 0) {
    lines.push('---');
    lines.push('hidden_interactive (' + hiddenInteractives.length + '):');
    const shown = hiddenInteractives.slice(0, 10);
    for (const h of shown) {
      const label = h.text ? ' "' + h.text + '"' : '';
      lines.push('  <' + h.tag + '>' + label + ' ~' + h.pagesAway + ' pages ' + h.direction);
    }
    if (hiddenInteractives.length > 10) lines.push('  …' + (hiddenInteractives.length - 10) + ' more');
  }

  // Footer
  lines.push('---');
  lines.push('interactive: ' + interactiveIndex + ' | iframes: ' + iframeCount);

  // Store hashes on window for next diff snapshot
  try { window.__opencli_prev_hashes = JSON.stringify(currentHashes); } catch {}

  return lines.join('\\n');
})()
  `.trim();
}
//#endregion
//#region src/background.ts
var ws = null;
var reconnectTimer = null;
var reconnectAttempts = 0;
var _origLog = console.log.bind(console);
var _origWarn = console.warn.bind(console);
var _origError = console.error.bind(console);
function forwardLog(level, args) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	try {
		const msg = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
		ws.send(JSON.stringify({
			type: "log",
			level,
			msg,
			ts: Date.now()
		}));
	} catch {}
}
console.log = (...args) => {
	_origLog(...args);
	forwardLog("info", args);
};
console.warn = (...args) => {
	_origWarn(...args);
	forwardLog("warn", args);
};
console.error = (...args) => {
	_origError(...args);
	forwardLog("error", args);
};
/**
* Probe the daemon via its /ping HTTP endpoint before attempting a WebSocket
* connection.  fetch() failures are silently catchable; new WebSocket() is not
* — Chrome logs ERR_CONNECTION_REFUSED to the extension error page before any
* JS handler can intercept it.  By keeping the probe inside connect() every
* call site remains unchanged and the guard can never be accidentally skipped.
*/
async function connect() {
	if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
	try {
		if (!(await fetch(DAEMON_PING_URL, { signal: AbortSignal.timeout(1e3) })).ok) return;
	} catch {
		return;
	}
	try {
		ws = new WebSocket(DAEMON_WS_URL);
	} catch {
		scheduleReconnect();
		return;
	}
	ws.onopen = () => {
		console.log("[opencli] Connected to daemon");
		reconnectAttempts = 0;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		ws?.send(JSON.stringify({
			type: "hello",
			version: chrome.runtime.getManifest().version
		}));
	};
	ws.onmessage = async (event) => {
		try {
			const result = await handleCommand(JSON.parse(event.data));
			ws?.send(JSON.stringify(result));
		} catch (err) {
			console.error("[opencli] Message handling error:", err);
		}
	};
	ws.onclose = () => {
		console.log("[opencli] Disconnected from daemon");
		ws = null;
		scheduleReconnect();
	};
	ws.onerror = () => {
		ws?.close();
	};
}
/**
* After MAX_EAGER_ATTEMPTS (reaching 60s backoff), stop scheduling reconnects.
* The keepalive alarm (~24s) will still call connect() periodically, but at a
* much lower frequency — reducing console noise when the daemon is not running.
*/
var MAX_EAGER_ATTEMPTS = 6;
function scheduleReconnect() {
	if (reconnectTimer) return;
	reconnectAttempts++;
	if (reconnectAttempts > MAX_EAGER_ATTEMPTS) return;
	const delay = Math.min(WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1), WS_RECONNECT_MAX_DELAY);
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect();
	}, delay);
}
var automationSessions = /* @__PURE__ */ new Map();
var WINDOW_IDLE_TIMEOUT = 3e4;
var windowFocused = false;
function getWorkspaceKey(workspace) {
	return workspace?.trim() || "default";
}
function resetWindowIdleTimer(workspace) {
	const session = automationSessions.get(workspace);
	if (!session) return;
	if (session.idleTimer) clearTimeout(session.idleTimer);
	session.idleDeadlineAt = Date.now() + WINDOW_IDLE_TIMEOUT;
	session.idleTimer = setTimeout(async () => {
		const current = automationSessions.get(workspace);
		if (!current) return;
		if (!current.owned) {
			console.log(`[opencli] Borrowed workspace ${workspace} detached from window ${current.windowId} (idle timeout)`);
			automationSessions.delete(workspace);
			return;
		}
		try {
			await chrome.windows.remove(current.windowId);
			console.log(`[opencli] Automation window ${current.windowId} (${workspace}) closed (idle timeout)`);
		} catch {}
		automationSessions.delete(workspace);
	}, WINDOW_IDLE_TIMEOUT);
}
/** Get or create the dedicated automation window.
*  @param initialUrl — if provided (http/https), used as the initial page instead of about:blank.
*    This avoids an extra blank-page→target-domain navigation on first command.
*/
async function getAutomationWindow(workspace, initialUrl) {
	const existing = automationSessions.get(workspace);
	if (existing) try {
		await chrome.windows.get(existing.windowId);
		return existing.windowId;
	} catch {
		automationSessions.delete(workspace);
	}
	const startUrl = initialUrl && isSafeNavigationUrl(initialUrl) ? initialUrl : BLANK_PAGE;
	const win = await chrome.windows.create({
		url: startUrl,
		focused: windowFocused,
		width: 1280,
		height: 900,
		type: "normal"
	});
	const session = {
		windowId: win.id,
		idleTimer: null,
		idleDeadlineAt: Date.now() + WINDOW_IDLE_TIMEOUT,
		owned: true,
		preferredTabId: null
	};
	automationSessions.set(workspace, session);
	console.log(`[opencli] Created automation window ${session.windowId} (${workspace}, start=${startUrl})`);
	resetWindowIdleTimer(workspace);
	const tabs = await chrome.tabs.query({ windowId: win.id });
	if (tabs[0]?.id) await new Promise((resolve) => {
		const timeout = setTimeout(resolve, 500);
		const listener = (tabId, info) => {
			if (tabId === tabs[0].id && info.status === "complete") {
				chrome.tabs.onUpdated.removeListener(listener);
				clearTimeout(timeout);
				resolve();
			}
		};
		if (tabs[0].status === "complete") {
			clearTimeout(timeout);
			resolve();
		} else chrome.tabs.onUpdated.addListener(listener);
	});
	return session.windowId;
}
chrome.windows.onRemoved.addListener(async (windowId) => {
	for (const [workspace, session] of automationSessions.entries()) if (session.windowId === windowId) {
		console.log(`[opencli] Automation window closed (${workspace})`);
		if (session.idleTimer) clearTimeout(session.idleTimer);
		automationSessions.delete(workspace);
	}
});
chrome.tabs.onRemoved.addListener((tabId) => {
	evictTab(tabId);
});
var initialized = false;
function initialize() {
	if (initialized) return;
	initialized = true;
	chrome.alarms.create("keepalive", { periodInMinutes: .4 });
	registerListeners();
	connect();
	console.log("[opencli] OpenCLI extension initialized");
}
chrome.runtime.onInstalled.addListener(() => {
	initialize();
});
chrome.runtime.onStartup.addListener(() => {
	initialize();
});
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === "keepalive") connect();
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg?.type === "getStatus") sendResponse({
		connected: ws?.readyState === WebSocket.OPEN,
		reconnecting: reconnectTimer !== null
	});
	else if (msg?.type === "getPageState") {
		handleGetPageState().then((result) => {
			sendResponse(result);
		}).catch((err) => {
			sendResponse({
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			});
		});
		return true;
	}
	return false;
});
chrome.commands.onCommand.addListener((command) => {
	if (command === "get-page-state") handleGetPageState().then((result) => {
		if (result.ok) chrome.notifications.create("opencli-page-state", {
			type: "basic",
			title: "OpenCLI",
			message: "Page state captured successfully",
			iconUrl: "icons/icon-48.png"
		});
		else chrome.notifications.create("opencli-page-state-error", {
			type: "basic",
			title: "OpenCLI Error",
			message: `Failed to capture page state: ${result.error}`,
			iconUrl: "icons/icon-48.png"
		});
	});
});
async function handleGetPageState() {
	const workspace = "browser:default";
	try {
		const activeTabs = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true
		});
		const fallbackTabs = await chrome.tabs.query({ lastFocusedWindow: true });
		const allTabs = await chrome.tabs.query({});
		const boundTab = activeTabs.find((tab) => tab.id && (tab.url?.startsWith("http://") || tab.url?.startsWith("https://"))) ?? fallbackTabs.find((tab) => tab.id && (tab.url?.startsWith("http://") || tab.url?.startsWith("https://"))) ?? allTabs.find((tab) => tab.id && (tab.url?.startsWith("http://") || tab.url?.startsWith("https://")));
		if (!boundTab?.id) return {
			id: "popup-state",
			ok: false,
			error: "No active debuggable tab found"
		};
		setWorkspaceSession(workspace, {
			windowId: boundTab.windowId,
			owned: false,
			preferredTabId: boundTab.id
		});
		resetWindowIdleTimer(workspace);
		const snapshotJs = generateSnapshotJs({
			viewportExpand: 2e3,
			maxDepth: 50,
			interactiveOnly: false,
			maxTextLength: 120,
			includeScrollInfo: true,
			bboxDedup: true,
			includeShadowDom: true,
			includeIframes: true,
			maxIframes: 5,
			paintOrderCheck: true,
			annotateRefs: true,
			reportHidden: true,
			filterAds: true,
			markdownTables: true,
			previousHashes: null
		});
		const aggressive = workspace.startsWith("browser:") || workspace.startsWith("operate:");
		const data = await evaluateAsync(boundTab.id, snapshotJs, aggressive);
		const markElementsScript = `
      (() => {
        'use strict';

        // 移除之前的标记
        document.querySelectorAll('.opencli-element-mark').forEach(el => el.remove());

        // 遍历所有带有 data-opencli-ref 属性的元素
        document.querySelectorAll('[data-opencli-ref]').forEach(el => {
          try {
            const rect = el.getBoundingClientRect();
            const ref = el.getAttribute('data-opencli-ref');
            
            if (rect.width > 0 && rect.height > 0 && ref) {
              // 创建标记元素
              const mark = document.createElement('div');
              mark.className = 'opencli-element-mark';
              mark.textContent = ref;
              mark.style.position = 'absolute';
              mark.style.left = '0';
              mark.style.top = '0';
              mark.style.transform = 'translate(-50%, -50%)';
              mark.style.background = 'rgba(255, 0, 0, 0.8)';
              mark.style.color = 'white';
              mark.style.fontSize = '12px';
              mark.style.fontWeight = 'bold';
              mark.style.padding = '2px 6px';
              mark.style.borderRadius = '10px';
              mark.style.zIndex = '9999';
              mark.style.pointerEvents = 'none';
              mark.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
              
              // 计算中心位置
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              
              // 设置位置
              mark.style.left = centerX + 'px';
              mark.style.top = centerY + 'px';
              
              // 添加到文档
              document.body.appendChild(mark);
            }
          } catch (e) {
            // 忽略错误
          }
        });
      })()
    `;
		try {
			await evaluateAsync(boundTab.id, markElementsScript, aggressive);
		} catch (err) {}
		return {
			id: "popup-state",
			ok: true,
			data
		};
	} catch (err) {
		return {
			id: "popup-state",
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function handleCommand(cmd) {
	const workspace = getWorkspaceKey(cmd.workspace);
	windowFocused = cmd.windowFocused === true;
	resetWindowIdleTimer(workspace);
	try {
		switch (cmd.action) {
			case "exec": return await handleExec(cmd, workspace);
			case "navigate": return await handleNavigate(cmd, workspace);
			case "tabs": return await handleTabs(cmd, workspace);
			case "cookies": return await handleCookies(cmd);
			case "screenshot": return await handleScreenshot(cmd, workspace);
			case "close-window": return await handleCloseWindow(cmd, workspace);
			case "cdp": return await handleCdp(cmd, workspace);
			case "sessions": return await handleSessions(cmd);
			case "set-file-input": return await handleSetFileInput(cmd, workspace);
			case "insert-text": return await handleInsertText(cmd, workspace);
			case "bind-current": return await handleBindCurrent(cmd, workspace);
			case "network-capture-start": return await handleNetworkCaptureStart(cmd, workspace);
			case "network-capture-read": return await handleNetworkCaptureRead(cmd, workspace);
			default: return {
				id: cmd.id,
				ok: false,
				error: `Unknown action: ${cmd.action}`
			};
		}
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
/** Internal blank page used when no user URL is provided. */
var BLANK_PAGE = "about:blank";
/** Check if a URL can be attached via CDP — only allow http(s) and blank pages. */
function isDebuggableUrl(url) {
	if (!url) return true;
	return url.startsWith("http://") || url.startsWith("https://") || url === "about:blank" || url.startsWith("data:");
}
/** Check if a URL is safe for user-facing navigation (http/https only). */
function isSafeNavigationUrl(url) {
	return url.startsWith("http://") || url.startsWith("https://");
}
/** Minimal URL normalization for same-page comparison: root slash + default port only. */
function normalizeUrlForComparison(url) {
	if (!url) return "";
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "https:" && parsed.port === "443" || parsed.protocol === "http:" && parsed.port === "80") parsed.port = "";
		const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
		return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return url;
	}
}
function isTargetUrl(currentUrl, targetUrl) {
	return normalizeUrlForComparison(currentUrl) === normalizeUrlForComparison(targetUrl);
}
function matchesDomain(url, domain) {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`);
	} catch {
		return false;
	}
}
function matchesBindCriteria(tab, cmd) {
	if (!tab.id || !isDebuggableUrl(tab.url)) return false;
	if (cmd.matchDomain && !matchesDomain(tab.url, cmd.matchDomain)) return false;
	if (cmd.matchPathPrefix) try {
		if (!new URL(tab.url).pathname.startsWith(cmd.matchPathPrefix)) return false;
	} catch {
		return false;
	}
	return true;
}
function setWorkspaceSession(workspace, session) {
	const existing = automationSessions.get(workspace);
	if (existing?.idleTimer) clearTimeout(existing.idleTimer);
	automationSessions.set(workspace, {
		...session,
		idleTimer: null,
		idleDeadlineAt: Date.now() + WINDOW_IDLE_TIMEOUT
	});
}
/**
* Resolve tabId from command's page (targetId) or legacy tabId field.
* page (targetId) takes precedence. Returns undefined if neither is provided.
*/
async function resolveCommandTabId(cmd) {
	if (cmd.page) return resolveTabId$1(cmd.page);
	return cmd.tabId;
}
/**
* Resolve target tab in the automation window, returning both the tabId and
* the Tab object (when available) so callers can skip a redundant chrome.tabs.get().
*/
async function resolveTab(tabId, workspace, initialUrl) {
	if (tabId !== void 0) try {
		const tab = await chrome.tabs.get(tabId);
		const session = automationSessions.get(workspace);
		const matchesSession = session ? session.preferredTabId !== null ? session.preferredTabId === tabId : tab.windowId === session.windowId : false;
		if (isDebuggableUrl(tab.url) && matchesSession) return {
			tabId,
			tab
		};
		if (session && !matchesSession && session.preferredTabId === null && isDebuggableUrl(tab.url)) {
			console.warn(`[opencli] Tab ${tabId} drifted to window ${tab.windowId}, moving back to ${session.windowId}`);
			try {
				await chrome.tabs.move(tabId, {
					windowId: session.windowId,
					index: -1
				});
				const moved = await chrome.tabs.get(tabId);
				if (moved.windowId === session.windowId && isDebuggableUrl(moved.url)) return {
					tabId,
					tab: moved
				};
			} catch (moveErr) {
				console.warn(`[opencli] Failed to move tab back: ${moveErr}`);
			}
		} else if (!isDebuggableUrl(tab.url)) console.warn(`[opencli] Tab ${tabId} URL is not debuggable (${tab.url}), re-resolving`);
	} catch {
		console.warn(`[opencli] Tab ${tabId} no longer exists, re-resolving`);
	}
	const existingSession = automationSessions.get(workspace);
	if (existingSession?.preferredTabId !== null) try {
		const preferredTab = await chrome.tabs.get(existingSession.preferredTabId);
		if (isDebuggableUrl(preferredTab.url)) return {
			tabId: preferredTab.id,
			tab: preferredTab
		};
	} catch {
		automationSessions.delete(workspace);
	}
	const windowId = await getAutomationWindow(workspace, initialUrl);
	const tabs = await chrome.tabs.query({ windowId });
	const debuggableTab = tabs.find((t) => t.id && isDebuggableUrl(t.url));
	if (debuggableTab?.id) return {
		tabId: debuggableTab.id,
		tab: debuggableTab
	};
	const reuseTab = tabs.find((t) => t.id);
	if (reuseTab?.id) {
		await chrome.tabs.update(reuseTab.id, { url: BLANK_PAGE });
		await new Promise((resolve) => setTimeout(resolve, 300));
		try {
			const updated = await chrome.tabs.get(reuseTab.id);
			if (isDebuggableUrl(updated.url)) return {
				tabId: reuseTab.id,
				tab: updated
			};
			console.warn(`[opencli] data: URI was intercepted (${updated.url}), creating fresh tab`);
		} catch {}
	}
	const newTab = await chrome.tabs.create({
		windowId,
		url: BLANK_PAGE,
		active: true
	});
	if (!newTab.id) throw new Error("Failed to create tab in automation window");
	return {
		tabId: newTab.id,
		tab: newTab
	};
}
/** Build a page-scoped success result with targetId resolved from tabId */
async function pageScopedResult(id, tabId, data) {
	return {
		id,
		ok: true,
		data,
		page: await resolveTargetId(tabId)
	};
}
/** Convenience wrapper returning just the tabId (used by most handlers) */
async function resolveTabId(tabId, workspace, initialUrl) {
	return (await resolveTab(tabId, workspace, initialUrl)).tabId;
}
async function listAutomationTabs(workspace) {
	const session = automationSessions.get(workspace);
	if (!session) return [];
	if (session.preferredTabId !== null) try {
		return [await chrome.tabs.get(session.preferredTabId)];
	} catch {
		automationSessions.delete(workspace);
		return [];
	}
	try {
		return await chrome.tabs.query({ windowId: session.windowId });
	} catch {
		automationSessions.delete(workspace);
		return [];
	}
}
async function listAutomationWebTabs(workspace) {
	return (await listAutomationTabs(workspace)).filter((tab) => isDebuggableUrl(tab.url));
}
async function handleExec(cmd, workspace) {
	if (!cmd.code) return {
		id: cmd.id,
		ok: false,
		error: "Missing code"
	};
	const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
	try {
		const aggressive = workspace.startsWith("browser:") || workspace.startsWith("operate:");
		const data = await evaluateAsync(tabId, cmd.code, aggressive);
		return pageScopedResult(cmd.id, tabId, data);
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function handleNavigate(cmd, workspace) {
	if (!cmd.url) return {
		id: cmd.id,
		ok: false,
		error: "Missing url"
	};
	if (!isSafeNavigationUrl(cmd.url)) return {
		id: cmd.id,
		ok: false,
		error: "Blocked URL scheme -- only http:// and https:// are allowed"
	};
	const resolved = await resolveTab(await resolveCommandTabId(cmd), workspace, cmd.url);
	const tabId = resolved.tabId;
	const beforeTab = resolved.tab ?? await chrome.tabs.get(tabId);
	const beforeNormalized = normalizeUrlForComparison(beforeTab.url);
	const targetUrl = cmd.url;
	if (beforeTab.status === "complete" && isTargetUrl(beforeTab.url, targetUrl)) return pageScopedResult(cmd.id, tabId, {
		title: beforeTab.title,
		url: beforeTab.url,
		timedOut: false
	});
	await detach(tabId);
	await chrome.tabs.update(tabId, { url: targetUrl });
	let timedOut = false;
	await new Promise((resolve) => {
		let settled = false;
		let checkTimer = null;
		let timeoutTimer = null;
		const finish = () => {
			if (settled) return;
			settled = true;
			chrome.tabs.onUpdated.removeListener(listener);
			if (checkTimer) clearTimeout(checkTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			resolve();
		};
		const isNavigationDone = (url) => {
			return isTargetUrl(url, targetUrl) || normalizeUrlForComparison(url) !== beforeNormalized;
		};
		const listener = (id, info, tab) => {
			if (id !== tabId) return;
			if (info.status === "complete" && isNavigationDone(tab.url ?? info.url)) finish();
		};
		chrome.tabs.onUpdated.addListener(listener);
		checkTimer = setTimeout(async () => {
			try {
				const currentTab = await chrome.tabs.get(tabId);
				if (currentTab.status === "complete" && isNavigationDone(currentTab.url)) finish();
			} catch {}
		}, 100);
		timeoutTimer = setTimeout(() => {
			timedOut = true;
			console.warn(`[opencli] Navigate to ${targetUrl} timed out after 15s`);
			finish();
		}, 15e3);
	});
	let tab = await chrome.tabs.get(tabId);
	const session = automationSessions.get(workspace);
	if (session && tab.windowId !== session.windowId) {
		console.warn(`[opencli] Tab ${tabId} drifted to window ${tab.windowId} during navigation, moving back to ${session.windowId}`);
		try {
			await chrome.tabs.move(tabId, {
				windowId: session.windowId,
				index: -1
			});
			tab = await chrome.tabs.get(tabId);
		} catch (moveErr) {
			console.warn(`[opencli] Failed to recover drifted tab: ${moveErr}`);
		}
	}
	return pageScopedResult(cmd.id, tabId, {
		title: tab.title,
		url: tab.url,
		timedOut
	});
}
async function handleTabs(cmd, workspace) {
	switch (cmd.op) {
		case "list": {
			const tabs = await listAutomationWebTabs(workspace);
			const data = await Promise.all(tabs.map(async (t, i) => {
				let page;
				try {
					page = t.id ? await resolveTargetId(t.id) : void 0;
				} catch {}
				return {
					index: i,
					page,
					url: t.url,
					title: t.title,
					active: t.active
				};
			}));
			return {
				id: cmd.id,
				ok: true,
				data
			};
		}
		case "new": {
			if (cmd.url && !isSafeNavigationUrl(cmd.url)) return {
				id: cmd.id,
				ok: false,
				error: "Blocked URL scheme -- only http:// and https:// are allowed"
			};
			const windowId = await getAutomationWindow(workspace);
			const tab = await chrome.tabs.create({
				windowId,
				url: cmd.url ?? BLANK_PAGE,
				active: true
			});
			if (!tab.id) return {
				id: cmd.id,
				ok: false,
				error: "Failed to create tab"
			};
			return pageScopedResult(cmd.id, tab.id, { url: tab.url });
		}
		case "close": {
			if (cmd.index !== void 0) {
				const target = (await listAutomationWebTabs(workspace))[cmd.index];
				if (!target?.id) return {
					id: cmd.id,
					ok: false,
					error: `Tab index ${cmd.index} not found`
				};
				const closedPage = await resolveTargetId(target.id).catch(() => void 0);
				await chrome.tabs.remove(target.id);
				await detach(target.id);
				return {
					id: cmd.id,
					ok: true,
					data: { closed: closedPage }
				};
			}
			const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
			const closedPage = await resolveTargetId(tabId).catch(() => void 0);
			await chrome.tabs.remove(tabId);
			await detach(tabId);
			return {
				id: cmd.id,
				ok: true,
				data: { closed: closedPage }
			};
		}
		case "select": {
			if (cmd.index === void 0 && cmd.page === void 0 && cmd.tabId === void 0) return {
				id: cmd.id,
				ok: false,
				error: "Missing index or page"
			};
			const cmdTabId = await resolveCommandTabId(cmd);
			if (cmdTabId !== void 0) {
				const session = automationSessions.get(workspace);
				let tab;
				try {
					tab = await chrome.tabs.get(cmdTabId);
				} catch {
					return {
						id: cmd.id,
						ok: false,
						error: `Page no longer exists`
					};
				}
				if (!session || tab.windowId !== session.windowId) return {
					id: cmd.id,
					ok: false,
					error: `Page is not in the automation window`
				};
				await chrome.tabs.update(cmdTabId, { active: true });
				return pageScopedResult(cmd.id, cmdTabId, { selected: true });
			}
			const target = (await listAutomationWebTabs(workspace))[cmd.index];
			if (!target?.id) return {
				id: cmd.id,
				ok: false,
				error: `Tab index ${cmd.index} not found`
			};
			await chrome.tabs.update(target.id, { active: true });
			return pageScopedResult(cmd.id, target.id, { selected: true });
		}
		default: return {
			id: cmd.id,
			ok: false,
			error: `Unknown tabs op: ${cmd.op}`
		};
	}
}
async function handleCookies(cmd) {
	if (!cmd.domain && !cmd.url) return {
		id: cmd.id,
		ok: false,
		error: "Cookie scope required: provide domain or url to avoid dumping all cookies"
	};
	const details = {};
	if (cmd.domain) details.domain = cmd.domain;
	if (cmd.url) details.url = cmd.url;
	const data = (await chrome.cookies.getAll(details)).map((c) => ({
		name: c.name,
		value: c.value,
		domain: c.domain,
		path: c.path,
		secure: c.secure,
		httpOnly: c.httpOnly,
		expirationDate: c.expirationDate
	}));
	return {
		id: cmd.id,
		ok: true,
		data
	};
}
async function handleScreenshot(cmd, workspace) {
	const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
	try {
		const data = await screenshot(tabId, {
			format: cmd.format,
			quality: cmd.quality,
			fullPage: cmd.fullPage
		});
		return pageScopedResult(cmd.id, tabId, data);
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
/** CDP methods permitted via the 'cdp' passthrough action. */
var CDP_ALLOWLIST = new Set([
	"Accessibility.getFullAXTree",
	"DOM.getDocument",
	"DOM.getBoxModel",
	"DOM.getContentQuads",
	"DOM.querySelectorAll",
	"DOM.scrollIntoViewIfNeeded",
	"DOMSnapshot.captureSnapshot",
	"Input.dispatchMouseEvent",
	"Input.dispatchKeyEvent",
	"Input.insertText",
	"Page.getLayoutMetrics",
	"Page.captureScreenshot",
	"Runtime.enable",
	"Emulation.setDeviceMetricsOverride",
	"Emulation.clearDeviceMetricsOverride"
]);
async function handleCdp(cmd, workspace) {
	if (!cmd.cdpMethod) return {
		id: cmd.id,
		ok: false,
		error: "Missing cdpMethod"
	};
	if (!CDP_ALLOWLIST.has(cmd.cdpMethod)) return {
		id: cmd.id,
		ok: false,
		error: `CDP method not permitted: ${cmd.cdpMethod}`
	};
	const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
	try {
		await ensureAttached(tabId, workspace.startsWith("browser:") || workspace.startsWith("operate:"));
		const data = await chrome.debugger.sendCommand({ tabId }, cmd.cdpMethod, cmd.cdpParams ?? {});
		return pageScopedResult(cmd.id, tabId, data);
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function handleCloseWindow(cmd, workspace) {
	const session = automationSessions.get(workspace);
	if (session) {
		if (session.owned) try {
			await chrome.windows.remove(session.windowId);
		} catch {}
		if (session.idleTimer) clearTimeout(session.idleTimer);
		automationSessions.delete(workspace);
	}
	return {
		id: cmd.id,
		ok: true,
		data: { closed: true }
	};
}
async function handleSetFileInput(cmd, workspace) {
	if (!cmd.files || !Array.isArray(cmd.files) || cmd.files.length === 0) return {
		id: cmd.id,
		ok: false,
		error: "Missing or empty files array"
	};
	const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
	try {
		await setFileInputFiles(tabId, cmd.files, cmd.selector);
		return pageScopedResult(cmd.id, tabId, { count: cmd.files.length });
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function handleInsertText(cmd, workspace) {
	if (typeof cmd.text !== "string") return {
		id: cmd.id,
		ok: false,
		error: "Missing text payload"
	};
	const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
	try {
		await insertText(tabId, cmd.text);
		return pageScopedResult(cmd.id, tabId, { inserted: true });
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function handleNetworkCaptureStart(cmd, workspace) {
	const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
	try {
		await startNetworkCapture(tabId, cmd.pattern);
		return pageScopedResult(cmd.id, tabId, { started: true });
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function handleNetworkCaptureRead(cmd, workspace) {
	const tabId = await resolveTabId(await resolveCommandTabId(cmd), workspace);
	try {
		const data = await readNetworkCapture(tabId);
		return pageScopedResult(cmd.id, tabId, data);
	} catch (err) {
		return {
			id: cmd.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function handleSessions(cmd) {
	const now = Date.now();
	const data = await Promise.all([...automationSessions.entries()].map(async ([workspace, session]) => ({
		workspace,
		windowId: session.windowId,
		tabCount: (await chrome.tabs.query({ windowId: session.windowId })).filter((tab) => isDebuggableUrl(tab.url)).length,
		idleMsRemaining: Math.max(0, session.idleDeadlineAt - now)
	})));
	return {
		id: cmd.id,
		ok: true,
		data
	};
}
async function handleBindCurrent(cmd, workspace) {
	const activeTabs = await chrome.tabs.query({
		active: true,
		lastFocusedWindow: true
	});
	const fallbackTabs = await chrome.tabs.query({ lastFocusedWindow: true });
	const allTabs = await chrome.tabs.query({});
	const boundTab = activeTabs.find((tab) => matchesBindCriteria(tab, cmd)) ?? fallbackTabs.find((tab) => matchesBindCriteria(tab, cmd)) ?? allTabs.find((tab) => matchesBindCriteria(tab, cmd));
	if (!boundTab?.id) return {
		id: cmd.id,
		ok: false,
		error: cmd.matchDomain || cmd.matchPathPrefix ? `No visible tab matching ${cmd.matchDomain ?? "domain"}${cmd.matchPathPrefix ? ` ${cmd.matchPathPrefix}` : ""}` : "No active debuggable tab found"
	};
	setWorkspaceSession(workspace, {
		windowId: boundTab.windowId,
		owned: false,
		preferredTabId: boundTab.id
	});
	resetWindowIdleTimer(workspace);
	console.log(`[opencli] Workspace ${workspace} explicitly bound to tab ${boundTab.id} (${boundTab.url})`);
	return pageScopedResult(cmd.id, boundTab.id, {
		url: boundTab.url,
		title: boundTab.title,
		workspace
	});
}
//#endregion
