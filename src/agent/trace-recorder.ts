/**
 * Rich Trace Recorder — captures full context during agent execution
 * for high-quality TS skill generation.
 *
 * Captures: action trace, network requests (with response bodies),
 * auth context, agent thinking/memory, DOM snapshots.
 */

import type { IPage } from '../types.js';
import type { DomContext, ElementInfo } from './dom-context.js';
import type { AgentResponse, ActionResult, AgentAction } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface TraceStep {
  stepNumber: number;
  url: string;
  action: AgentAction;
  selector?: string;
  elementText?: string;
  extractedContent?: string;
  timestamp: number;
}

export interface CapturedRequest {
  url: string;
  method: string;
  status: number;
  responseBody: unknown;
  responseSize: number;
  contentType: string;
}

export interface AuthContext {
  cookieNames: string[];
  /** Whether a CSRF token was detected (value is never stored) */
  csrfPresent: boolean;
  /** Whether bearer auth was detected */
  bearerPresent: boolean;
  authHeaders: Record<string, string>;
}

export interface RichTrace {
  task: string;
  startUrl?: string;
  steps: TraceStep[];
  thinkingLog: Array<{ step: number; thinking: string; memory?: string }>;
  networkCapture: CapturedRequest[];
  authContext: AuthContext;
  finalData: unknown;
  domSnapshots: string[];
  result?: string;
  extractedData?: unknown;
  duration: number;
  recordedAt: string;
}

// Keep backward compat alias
export type ActionTrace = RichTrace;

// ── Network Interceptor JS ────────────────────────────────────────────

/** JS injected into the page to capture fetch/XHR responses. */
const INSTALL_NETWORK_INTERCEPTOR_JS = `
(function() {
  if (window.__opencli_net_capture) return;
  window.__opencli_net_capture = [];
  var MAX_BODY_SIZE = 50000; // 50KB per response, prevent memory explosion

  var origFetch = window.fetch;
  window.fetch = async function() {
    var resp = await origFetch.apply(this, arguments);
    try {
      var ct = resp.headers.get('content-type') || '';
      if (ct.includes('json') || ct.includes('xml') || ct.includes('text')) {
        var clone = resp.clone();
        var text = await clone.text();
        var body = null;
        if (text.length <= MAX_BODY_SIZE) {
          try { body = JSON.parse(text); } catch(e) { body = text; }
        }
        window.__opencli_net_capture.push({
          url: resp.url || (arguments[0] && arguments[0].url) || String(arguments[0]),
          method: (arguments[1] && arguments[1].method) || 'GET',
          status: resp.status,
          responseBody: body,
          responseSize: text.length,
          contentType: ct,
        });
      }
    } catch(e) { /* ignore capture errors */ }
    return resp;
  };

  var origXHR = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__opencli_method = method;
    this.__opencli_url = url;
    return origXHR.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      try {
        var ct = xhr.getResponseHeader('content-type') || '';
        if (ct.includes('json') || ct.includes('xml') || ct.includes('text')) {
          var text = xhr.responseText;
          var body = null;
          if (text && text.length <= MAX_BODY_SIZE) {
            try { body = JSON.parse(text); } catch(e) { body = text; }
          }
          window.__opencli_net_capture.push({
            url: xhr.__opencli_url,
            method: xhr.__opencli_method || 'GET',
            status: xhr.status,
            responseBody: body,
            responseSize: text ? text.length : 0,
            contentType: ct,
          });
        }
      } catch(e) { /* ignore */ }
    });
    return origSend.apply(this, arguments);
  };
})()
`;

const READ_NETWORK_CAPTURE_JS = `
(function() {
  var data = window.__opencli_net_capture || [];
  window.__opencli_net_capture = []; // clear after read
  return data;
})()
`;

const READ_AUTH_CONTEXT_JS = `
(function() {
  var cookies = document.cookie.split(';').map(function(c) { return c.trim().split('=')[0]; });
  // Only detect presence of CSRF, never extract the actual value
  var csrfCookie = document.cookie.split(';').map(function(c) { return c.trim(); })
    .find(function(c) { return /^(ct0|csrf|_csrf|XSRF|xsrf)/i.test(c); });
  var metaCsrf = document.querySelector('meta[name="csrf-token"]');
  var csrfPresent = !!(csrfCookie || metaCsrf);
  return { cookieNames: cookies, csrfPresent: csrfPresent };
})()
`;

// ── Recorder Class ────────────────────────────────────────────────────

export class TraceRecorder {
  private steps: TraceStep[] = [];
  private thinkingLog: Array<{ step: number; thinking: string; memory?: string }> = [];
  private domSnapshots: string[] = [];
  private startTime = Date.now();
  private interceptorInstalled = false;

  /**
   * Install the network interceptor into the page.
   * Safe to call multiple times — the JS guard checks if already installed,
   * and after navigation the old document is gone so it re-installs.
   */
  async installInterceptor(page: IPage): Promise<void> {
    try {
      await page.evaluate(INSTALL_NETWORK_INTERCEPTOR_JS);
    } catch {
      // Non-fatal — we can still record actions without network capture
    }
  }

  /** Record a step's actions, thinking, and DOM context. */
  recordStep(
    stepNumber: number,
    domContext: DomContext,
    response: AgentResponse,
    results: ActionResult[],
  ): void {
    // Record thinking
    this.thinkingLog.push({
      step: stepNumber,
      thinking: response.thinking,
      memory: response.memory,
    });

    // Capture first and last DOM snapshots
    if (this.domSnapshots.length === 0 || stepNumber <= 1) {
      this.domSnapshots.push(domContext.snapshotText.slice(0, 5000));
    }

    // Record each action
    for (let i = 0; i < response.actions.length; i++) {
      const action = response.actions[i];
      const result = results[i];
      if (!result?.success || action.type === 'done') continue;

      const traceStep: TraceStep = {
        stepNumber,
        url: domContext.url,
        action,
        timestamp: Date.now(),
      };

      if ('index' in action && typeof action.index === 'number') {
        const el = domContext.elementMap.get(action.index);
        if (el) {
          traceStep.selector = buildDurableSelector(el);
          traceStep.elementText = el.text.slice(0, 50);
        }
      }

      if (result.extractedContent) {
        traceStep.extractedContent = result.extractedContent;
      }

      this.steps.push(traceStep);
    }
  }

  /** Capture the final DOM snapshot before finalizing. */
  recordFinalSnapshot(domContext: DomContext): void {
    this.domSnapshots.push(domContext.snapshotText.slice(0, 5000));
  }

  /** Collect all captured data and produce the final RichTrace. */
  async finalize(
    page: IPage,
    task: string,
    startUrl?: string,
    result?: string,
    extractedData?: unknown,
  ): Promise<RichTrace> {
    // Collect network captures from the page
    let networkCapture: CapturedRequest[] = [];
    try {
      const raw = await page.evaluate(READ_NETWORK_CAPTURE_JS);
      if (Array.isArray(raw)) {
        networkCapture = raw as CapturedRequest[];
      }
    } catch {
      // Page might have navigated away
    }

    // Collect auth context (only boolean flags, never actual token values)
    let authContext: AuthContext = { cookieNames: [], csrfPresent: false, bearerPresent: false, authHeaders: {} };
    try {
      const raw = await page.evaluate(READ_AUTH_CONTEXT_JS) as {
        cookieNames: string[];
        csrfPresent: boolean;
      } | null;
      if (raw) {
        authContext.cookieNames = raw.cookieNames ?? [];
        authContext.csrfPresent = !!raw.csrfPresent;
      }
    } catch {
      // Non-fatal
    }

    return {
      task,
      startUrl,
      steps: this.steps,
      thinkingLog: this.thinkingLog,
      networkCapture,
      authContext,
      finalData: extractedData,
      domSnapshots: this.domSnapshots,
      result,
      extractedData,
      duration: Date.now() - this.startTime,
      recordedAt: new Date().toISOString(),
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function buildDurableSelector(el: ElementInfo): string {
  const attrs = el.attributes;

  if (attrs['data-testid']) return `[data-testid="${escapeCSS(attrs['data-testid'])}"]`;
  if (attrs['id']) return `#${escapeCSS(attrs['id'])}`;
  if (attrs['name'] && ['input', 'select', 'textarea'].includes(el.tag)) {
    return `${el.tag}[name="${escapeCSS(attrs['name'])}"]`;
  }
  if (attrs['aria-label']) return `${el.tag}[aria-label="${escapeCSS(attrs['aria-label'])}"]`;
  if (attrs['placeholder']) return `${el.tag}[placeholder="${escapeCSS(attrs['placeholder'])}"]`;
  if (el.tag === 'a' && attrs['href'] && attrs['href'].length < 100) {
    return `a[href="${escapeCSS(attrs['href'])}"]`;
  }
  if (attrs['type']) return `${el.tag}[type="${attrs['type']}"]`;
  return el.tag;
}

function escapeCSS(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
