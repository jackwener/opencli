/**
 * Page abstraction — implements IPage by sending commands to the daemon.
 *
 * All browser operations are ultimately 'exec' (JS evaluation via CDP)
 * plus a few native Chrome Extension APIs (tabs, cookies, navigate).
 *
 * IMPORTANT: After goto(), we remember the page identity (targetId) returned
 * by the navigate action and pass it to all subsequent commands. This ensures
 * page-scoped operations target the correct page without guessing.
 */

import type { BrowserCookie, ConsoleMessage, ScreenshotOptions } from '../types.js';
import { sendCommand, sendCommandFull } from './daemon-client.js';
import { wrapForEval } from './utils.js';
import { saveBase64ToFile } from '../utils.js';
import { generateStealthJs } from './stealth.js';
import { waitForDomStableJs } from './dom-helpers.js';
import { BasePage } from './base-page.js';
import { classifyBrowserError } from './errors.js';
import { clearWorkspaceTabId, loadWorkspaceTabId, saveWorkspaceTabId } from './workspace-tab-cache.js';

function isUnsupportedCaptureError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('Unknown action')
    || message.includes('network-capture')
    || message.includes('console-read')
    || message.includes('capture-stop');
}

/**
 * Page — implements IPage by talking to the daemon via HTTP.
 */
export class Page extends BasePage {
  private _nativeCaptureSupported: boolean | undefined;
  private _legacyTabId: number | undefined;

  constructor(private readonly workspace: string = 'default') {
    super();
    this._legacyTabId = loadWorkspaceTabId(workspace);
  }

  /** Active page identity (targetId), set after navigate and used in all subsequent commands */
  private _page: string | undefined;

  /** Helper: spread workspace into command params */
  private _wsOpt(): { workspace: string } {
    return { workspace: this.workspace };
  }

  /** Helper: spread workspace + page identity into command params */
  private _cmdOpts(): Record<string, unknown> {
    return {
      workspace: this.workspace,
      ...(this._page !== undefined && { page: this._page }),
      ...(this._page === undefined && this._legacyTabId !== undefined && { tabId: this._legacyTabId }),
    };
  }

  async goto(url: string, options?: { waitUntil?: 'load' | 'none'; settleMs?: number }): Promise<void> {
    const result = await sendCommandFull('navigate', {
      url,
      ...this._cmdOpts(),
    });
    if (result.page) {
      this._page = result.page;
      this._legacyTabId = undefined;
      clearWorkspaceTabId(this.workspace);
    } else {
      const data = result.data as { tabId?: number } | undefined;
      if (data?.tabId) {
        this._legacyTabId = data.tabId;
        saveWorkspaceTabId(this.workspace, data.tabId);
      }
    }
    this._lastUrl = url;
    if (options?.waitUntil !== 'none') {
      const maxMs = options?.settleMs ?? 1000;
      const combinedCode = `${generateStealthJs()};\n${waitForDomStableJs(maxMs, Math.min(500, maxMs))}`;
      const combinedOpts = {
        code: combinedCode,
        ...this._cmdOpts(),
      };
      try {
        await sendCommand('exec', combinedOpts);
      } catch (err) {
        const advice = classifyBrowserError(err);
        if (advice.kind !== 'target-navigation') throw err;
        try {
          await new Promise((r) => setTimeout(r, advice.delayMs));
          await sendCommand('exec', combinedOpts);
        } catch (retryErr) {
          if (classifyBrowserError(retryErr).kind !== 'target-navigation') throw retryErr;
        }
      }
    } else {
      try {
        await sendCommand('exec', {
          code: generateStealthJs(),
          ...this._cmdOpts(),
        });
      } catch {
        // Non-fatal: stealth is best-effort
      }
    }
  }

  /** Get the active page identity (targetId) */
  getActivePage(): string | undefined {
    return this._page;
  }

  /** @deprecated Use getActivePage() instead */
  getActiveTabId(): number | undefined {
    return this._legacyTabId;
  }

  async evaluate(js: string): Promise<unknown> {
    const code = wrapForEval(js);
    try {
      return await sendCommand('exec', { code, ...this._cmdOpts() });
    } catch (err) {
      const advice = classifyBrowserError(err);
      if (advice.kind !== 'target-navigation') throw err;
      await new Promise((resolve) => setTimeout(resolve, advice.delayMs));
      return sendCommand('exec', { code, ...this._cmdOpts() });
    }
  }

  async getCookies(opts: { domain?: string; url?: string } = {}): Promise<BrowserCookie[]> {
    const result = await sendCommand('cookies', { ...this._wsOpt(), ...opts });
    return Array.isArray(result) ? result : [];
  }

  /** Close the automation window in the extension */
  async closeWindow(): Promise<void> {
    try {
      await sendCommand('close-window', { ...this._wsOpt() });
    } catch {
      // Window may already be closed or daemon may be down
    } finally {
      this._page = undefined;
      this._legacyTabId = undefined;
      this._lastUrl = null;
      clearWorkspaceTabId(this.workspace);
    }
  }

  async tabs(): Promise<unknown[]> {
    const result = await sendCommand('tabs', { op: 'list', ...this._wsOpt() });
    return Array.isArray(result) ? result : [];
  }

  async selectTab(index: number): Promise<void> {
    const result = await sendCommandFull('tabs', { op: 'select', index, ...this._wsOpt() });
    if (result.page) {
      this._page = result.page;
      this._legacyTabId = undefined;
      clearWorkspaceTabId(this.workspace);
      return;
    }
    const data = result.data as { selected?: number } | undefined;
    if (typeof data?.selected === 'number') {
      this._legacyTabId = data.selected;
      saveWorkspaceTabId(this.workspace, data.selected);
    }
  }

  /**
   * Capture a screenshot via CDP Page.captureScreenshot.
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<string> {
    const base64 = await sendCommand('screenshot', {
      ...this._cmdOpts(),
      format: options.format,
      quality: options.quality,
      fullPage: options.fullPage,
    }) as string;

    if (options.path) {
      await saveBase64ToFile(base64, options.path);
    }

    return base64;
  }

  async startNetworkCapture(pattern: string = ''): Promise<void> {
    try {
      await sendCommand('network-capture-start', {
        pattern,
        ...this._cmdOpts(),
      });
      this._nativeCaptureSupported = true;
    } catch (err) {
      if (!isUnsupportedCaptureError(err)) throw err;
      this._nativeCaptureSupported = false;
    }
  }

  async readNetworkCapture(): Promise<unknown[]> {
    try {
      const result = await sendCommand('network-capture-read', {
        ...this._cmdOpts(),
      });
      this._nativeCaptureSupported = true;
      return Array.isArray(result) ? result : [];
    } catch (err) {
      if (!isUnsupportedCaptureError(err)) throw err;
      this._nativeCaptureSupported = false;
      return this.networkRequests(false);
    }
  }

  async stopCapture(): Promise<void> {
    try {
      await sendCommand('capture-stop', {
        ...this._cmdOpts(),
      });
      this._nativeCaptureSupported = true;
    } catch (err) {
      if (!isUnsupportedCaptureError(err)) throw err;
      this._nativeCaptureSupported = false;
    }
  }

  async consoleMessages(level: string = 'all'): Promise<ConsoleMessage[]> {
    let messages: ConsoleMessage[] = [];
    try {
      const result = await sendCommand('console-read', {
        ...this._cmdOpts(),
      });
      this._nativeCaptureSupported = true;
      messages = Array.isArray(result) ? result as ConsoleMessage[] : [];
    } catch (err) {
      if (!isUnsupportedCaptureError(err)) throw err;
      this._nativeCaptureSupported = false;
    }
    if (level === 'all') return messages;
    if (level === 'error') return messages.filter((message) => message.level === 'error' || message.level === 'warn');
    return messages.filter((message) => message.level === level);
  }

  hasNativeCaptureSupport(): boolean | undefined {
    return this._nativeCaptureSupported;
  }

  /**
   * Set local file paths on a file input element via CDP DOM.setFileInputFiles.
   * Chrome reads the files directly from the local filesystem, avoiding the
   * payload size limits of base64-in-evaluate.
   */
  async setFileInput(files: string[], selector?: string): Promise<void> {
    const result = await sendCommand('set-file-input', {
      files,
      selector,
      ...this._cmdOpts(),
    }) as { count?: number };
    if (!result?.count) {
      throw new Error('setFileInput returned no count — command may not be supported by the extension');
    }
  }

  async insertText(text: string): Promise<void> {
    const result = await sendCommand('insert-text', {
      text,
      ...this._cmdOpts(),
    }) as { inserted?: boolean };
    if (!result?.inserted) {
      throw new Error('insertText returned no inserted flag — command may not be supported by the extension');
    }
  }

  async cdp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return sendCommand('cdp', {
      cdpMethod: method,
      cdpParams: params,
      ...this._cmdOpts(),
    });
  }

  /** CDP native click fallback — called when JS el.click() fails */
  protected override async tryNativeClick(x: number, y: number): Promise<boolean> {
    try {
      await this.nativeClick(x, y);
      return true;
    } catch {
      return false;
    }
  }

  /** Precise click using DOM.getContentQuads/getBoxModel for inline elements */
  async clickWithQuads(ref: string): Promise<void> {
    const safeRef = JSON.stringify(ref);
    const cssSelector = `[data-opencli-ref="${ref.replace(/"/g, '\\"')}"]`;

    await this.evaluate(`
      (() => {
        const el = document.querySelector('[data-opencli-ref="' + ${safeRef} + '"]');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
        return !!el;
      })()
    `);

    try {
      const doc = await this.cdp('DOM.getDocument', {}) as { root: { nodeId: number } };
      const result = await this.cdp('DOM.querySelectorAll', {
        nodeId: doc.root.nodeId,
        selector: cssSelector,
      }) as { nodeIds: number[] };

      if (!result.nodeIds?.length) throw new Error('DOM node not found');

      const nodeId = result.nodeIds[0];

      try {
        const quads = await this.cdp('DOM.getContentQuads', { nodeId }) as { quads: number[][] };
        if (quads.quads?.length) {
          const q = quads.quads[0];
          const cx = (q[0] + q[2] + q[4] + q[6]) / 4;
          const cy = (q[1] + q[3] + q[5] + q[7]) / 4;
          await this.nativeClick(Math.round(cx), Math.round(cy));
          return;
        }
      } catch {}

      try {
        const box = await this.cdp('DOM.getBoxModel', { nodeId }) as { model: { content: number[] } };
        if (box.model?.content) {
          const c = box.model.content;
          const cx = (c[0] + c[2] + c[4] + c[6]) / 4;
          const cy = (c[1] + c[3] + c[5] + c[7]) / 4;
          await this.nativeClick(Math.round(cx), Math.round(cy));
          return;
        }
      } catch {}
    } catch {}

    await this.evaluate(`
      (() => {
        const el = document.querySelector('[data-opencli-ref="' + ${safeRef} + '"]');
        if (!el) throw new Error('Element not found: ' + ${safeRef});
        el.click();
        return 'clicked';
      })()
    `);
  }

  async nativeClick(x: number, y: number): Promise<void> {
    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x, y,
      button: 'left',
      clickCount: 1,
    });
    await this.cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x, y,
      button: 'left',
      clickCount: 1,
    });
  }

  async nativeType(text: string): Promise<void> {
    await this.cdp('Input.insertText', { text });
  }

  async nativeKeyPress(key: string, modifiers: string[] = []): Promise<void> {
    let modifierFlags = 0;
    for (const mod of modifiers) {
      if (mod === 'Alt') modifierFlags |= 1;
      if (mod === 'Ctrl') modifierFlags |= 2;
      if (mod === 'Meta') modifierFlags |= 4;
      if (mod === 'Shift') modifierFlags |= 8;
    }
    await this.cdp('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      modifiers: modifierFlags,
    });
    await this.cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      modifiers: modifierFlags,
    });
  }
}
