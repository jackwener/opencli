/**
 * CDP client — implements IPage by connecting directly to a Chrome/Electron CDP WebSocket.
 */

import { WebSocket, type RawData } from 'ws';
import type { IPage } from '../types.js';
import { wrapForEval } from './utils.js';

export interface CDPTarget {
  type?: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
}

export class CDPBridge {
  private _ws: WebSocket | null = null;
  private _idCounter = 0;
  private _pending = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>();

  async connect(opts?: { timeout?: number; workspace?: string }): Promise<IPage> {
    const endpoint = process.env.OPENCLI_CDP_ENDPOINT;
    if (!endpoint) throw new Error('OPENCLI_CDP_ENDPOINT is not set');

    // If it's a direct ws:// URL, use it. Otherwise, fetch the /json endpoint to find a page.
    let wsUrl = endpoint;
    if (endpoint.startsWith('http')) {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/json`);
      if (!res.ok) throw new Error(`Failed to fetch CDP targets: ${res.statusText}`);
      const targets = await res.json() as CDPTarget[];
      const target = selectCDPTarget(targets);
      if (!target || !target.webSocketDebuggerUrl) {
        throw new Error('No inspectable targets found at CDP endpoint');
      }
      wsUrl = target.webSocketDebuggerUrl;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => reject(new Error('CDP connect timeout')), opts?.timeout ?? 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this._ws = ws;
        resolve(new CDPPage(this));
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('message', (data: RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && this._pending.has(msg.id)) {
            const { resolve, reject } = this._pending.get(msg.id)!;
            this._pending.delete(msg.id);
            if (msg.error) {
              reject(new Error(msg.error.message));
            } else {
              resolve(msg.result);
            }
          }
        } catch (e) {
          // ignore parsing errors
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    for (const p of this._pending.values()) {
      p.reject(new Error('CDP connection closed'));
    }
    this._pending.clear();
  }

  async send(method: string, params: any = {}): Promise<any> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error('CDP connection is not open');
    }
    const id = ++this._idCounter;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._ws!.send(JSON.stringify({ id, method, params }));
    });
  }
}

class CDPPage implements IPage {
  constructor(private bridge: CDPBridge) {}

  async goto(url: string): Promise<void> {
    await this.bridge.send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 1000));
  }

  async evaluate(js: string): Promise<any> {
    const expression = wrapForEval(js);
    const result = await this.bridge.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error('Evaluate error: ' + (result.exceptionDetails.exception?.description || 'Unknown exception'));
    }
    return result.result?.value;
  }

  async getCookies(opts: { domain?: string; url?: string } = {}): Promise<any[]> {
    const result = await this.bridge.send('Network.getCookies', opts.url ? { urls: [opts.url] } : {});
    const cookies = Array.isArray(result?.cookies) ? result.cookies : [];
    return opts.domain
      ? cookies.filter((cookie: any) => typeof cookie.domain === 'string' && cookie.domain.includes(opts.domain!))
      : cookies;
  }

  async snapshot(opts?: any): Promise<any> {
    throw new Error('Method not implemented.');
  }
  async click(ref: string): Promise<void> {
    const safeRef = JSON.stringify(ref);
    const code = `
      (() => {
        const ref = ${safeRef};
        const el = document.querySelector('[data-ref="' + ref + '"]')
          || document.querySelectorAll('a, button, input, [role="button"], [tabindex]')[parseInt(ref, 10) || 0];
        if (!el) throw new Error('Element not found: ' + ref);
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click();
        return 'clicked';
      })()
    `;
    await this.evaluate(code);
  }
  async typeText(ref: string, text: string): Promise<void> {
    const safeRef = JSON.stringify(ref);
    const safeText = JSON.stringify(text);
    const code = `
      (() => {
        const ref = ${safeRef};
        const el = document.querySelector('[data-ref="' + ref + '"]')
          || document.querySelectorAll('input, textarea, [contenteditable]')[parseInt(ref, 10) || 0];
        if (!el) throw new Error('Element not found: ' + ref);
        el.focus();
        el.value = ${safeText};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'typed';
      })()
    `;
    await this.evaluate(code);
  }
  async pressKey(key: string): Promise<void> {
    const code = `
      (() => {
        const el = document.activeElement || document.body;
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(key)}, bubbles: true }));
        return 'pressed';
      })()
    `;
    await this.evaluate(code);
  }
  async wait(options: any): Promise<void> {
    if (typeof options === 'number') {
      await new Promise(resolve => setTimeout(resolve, options * 1000));
      return;
    }
    if (options.time) {
      await new Promise(resolve => setTimeout(resolve, options.time * 1000));
      return;
    }
    if (options.text) {
      const timeout = (options.timeout ?? 30) * 1000;
      const code = `
        new Promise((resolve, reject) => {
          const deadline = Date.now() + ${timeout};
          const check = () => {
            if (document.body.innerText.includes(${JSON.stringify(options.text)})) return resolve('found');
            if (Date.now() > deadline) return reject(new Error('Text not found: ' + ${JSON.stringify(options.text)}));
            setTimeout(check, 200);
          };
          check();
        })
      `;
      await this.evaluate(code);
    }
  }
  async tabs(): Promise<any> {
    throw new Error('Method not implemented.');
  }
  async closeTab(index?: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async newTab(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async selectTab(index: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async networkRequests(includeStatic?: boolean): Promise<any> {
    throw new Error('Method not implemented.');
  }
  async consoleMessages(level?: string): Promise<any> {
    throw new Error('Method not implemented.');
  }
  async scroll(direction?: string, amount?: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async autoScroll(options?: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async installInterceptor(pattern: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async getInterceptedRequests(): Promise<any[]> {
    throw new Error('Method not implemented.');
  }
  async screenshot(options?: any): Promise<string> {
    throw new Error('Method not implemented.');
  }
}
function selectCDPTarget(targets: CDPTarget[]): CDPTarget | undefined {
  const preferredPattern = compilePreferredPattern(process.env.OPENCLI_CDP_TARGET);

  const ranked = targets
    .map((target, index) => ({ target, index, score: scoreCDPTarget(target, preferredPattern) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

  return ranked[0]?.target;
}

function scoreCDPTarget(target: CDPTarget, preferredPattern?: RegExp): number {
  if (!target.webSocketDebuggerUrl) return Number.NEGATIVE_INFINITY;

  const type = (target.type ?? '').toLowerCase();
  const url = (target.url ?? '').toLowerCase();
  const title = (target.title ?? '').toLowerCase();
  const haystack = `${title} ${url}`;

  if (!haystack.trim() && !type) return Number.NEGATIVE_INFINITY;
  if (haystack.includes('devtools')) return Number.NEGATIVE_INFINITY;

  let score = 0;

  if (preferredPattern && preferredPattern.test(haystack)) score += 1000;

  if (type === 'app') score += 120;
  else if (type === 'webview') score += 100;
  else if (type === 'page') score += 80;
  else if (type === 'iframe') score += 20;

  if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) score += 90;
  if (url.startsWith('file://')) score += 60;
  if (url.startsWith('http://127.0.0.1') || url.startsWith('https://127.0.0.1')) score += 50;
  if (url.startsWith('about:blank')) score -= 120;
  if (url === '' || url === 'about:blank') score -= 40;

  if (title && title !== 'devtools') score += 25;
  if (title.includes('antigravity')) score += 120;
  if (title.includes('codex')) score += 120;
  if (title.includes('cursor')) score += 120;
  if (title.includes('chatwise')) score += 120;
  if (title.includes('notion')) score += 120;
  if (title.includes('discord')) score += 120;
  if (title.includes('netease')) score += 120;

  if (url.includes('antigravity')) score += 100;
  if (url.includes('codex')) score += 100;
  if (url.includes('cursor')) score += 100;
  if (url.includes('chatwise')) score += 100;
  if (url.includes('notion')) score += 100;
  if (url.includes('discord')) score += 100;
  if (url.includes('netease')) score += 100;

  return score;
}

function compilePreferredPattern(raw: string | undefined): RegExp | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return new RegExp(escapeRegExp(value.toLowerCase()));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const __test__ = {
  selectCDPTarget,
  scoreCDPTarget,
};
