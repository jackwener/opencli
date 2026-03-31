/**
 * Action Executor — dispatches parsed LLM actions to the browser via IPage.
 *
 * Prioritizes native CDP Input events (nativeClick/nativeType) when available,
 * falls back to JS injection (page.click/page.typeText) for compatibility.
 */

import type { IPage } from '../types.js';
import type { AgentAction, ActionResult } from './types.js';
import type { ElementInfo } from './dom-context.js';

export class ActionExecutor {
  constructor(private page: IPage) {}

  async execute(
    action: AgentAction,
    elementMap: Map<number, ElementInfo>,
  ): Promise<ActionResult> {
    try {
      switch (action.type) {
        case 'click':
          return await this.executeClick(action, elementMap);
        case 'type':
          return await this.executeType(action, elementMap);
        case 'navigate':
          return await this.executeNavigate(action);
        case 'scroll':
          return await this.executeScroll(action, elementMap);
        case 'wait':
          return await this.executeWait(action);
        case 'extract':
          return await this.executeExtract(action);
        case 'go_back':
          return await this.executeGoBack();
        case 'press_key':
          return await this.executePressKey(action);
        case 'select_dropdown':
          return await this.executeSelectDropdown(action, elementMap);
        case 'switch_tab':
          return await this.executeSwitchTab(action);
        case 'open_tab':
          return await this.executeOpenTab(action);
        case 'close_tab':
          return await this.executeCloseTab();
        case 'search_page':
          return await this.executeSearchPage(action);
        case 'done':
          return { action, success: true, extractedContent: action.result };
        default:
          return { action, success: false, error: `Unknown action type: ${(action as AgentAction).type}` };
      }
    } catch (err) {
      return {
        action,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Click ───────────────────────────────────────────────────────────────

  private async executeClick(
    action: Extract<AgentAction, { type: 'click' }>,
    elementMap: Map<number, ElementInfo>,
  ): Promise<ActionResult> {
    const el = elementMap.get(action.index);
    if (!el) {
      return { action, success: false, error: `Element [${action.index}] not found in current snapshot` };
    }

    // Auto-detect <select> and suggest select_dropdown instead
    if (el.tag === 'select') {
      return { action, success: false, error: `Element [${action.index}] is a <select> — use "select_dropdown" action instead` };
    }

    await this.clickElement(action.index, el);
    await this.page.wait(0.5);
    return { action, success: true };
  }

  /** Scroll an element into the viewport center before interacting with it. */
  private async scrollIntoView(index: number): Promise<void> {
    await this.page.evaluate(`
      (function() {
        var el = document.querySelector('[data-opencli-ref="${index}"]');
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      })()
    `);
    await this.page.wait(0.3);
  }

  /** Click an element: scroll into view, try CDP click, fallback to JS click, final fallback to evaluate */
  private async clickElement(index: number, el: ElementInfo): Promise<void> {
    // Always scroll into view first — CDP mouse events only work within the viewport
    await this.scrollIntoView(index);

    // Strategy 1: Native CDP click with fresh coordinates
    if (this.page.nativeClick) {
      try {
        const freshPos = await this.page.evaluate(`
          (function() {
            var el = document.querySelector('[data-opencli-ref="${index}"]');
            if (!el) return null;
            var r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          })()
        `) as { x: number; y: number } | null;

        if (freshPos && freshPos.x > 0 && freshPos.y > 0) {
          await this.page.nativeClick(freshPos.x, freshPos.y);
          return;
        }
      } catch {
        // CDP click failed — try next strategy
      }
    }

    // Strategy 2: JS click via page.click (uses dom-helpers clickJs)
    try {
      await this.page.click(String(index));
      return;
    } catch {
      // page.click also failed — try final fallback
    }

    // Strategy 3: Direct JS evaluate click (most robust, works even if ref format differs)
    await this.page.evaluate(`
      (function() {
        var el = document.querySelector('[data-opencli-ref="${index}"]');
        if (el) { el.click(); return; }
        // Fallback: try finding by link text if it's a link
        var links = document.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
          if (links[i].textContent.trim().includes(${JSON.stringify(el.text.slice(0, 30))})) {
            links[i].click();
            return;
          }
        }
      })()
    `);
  }

  /** Type into an element: try native CDP, fallback to JS injection */
  private async typeIntoElement(index: number, text: string): Promise<void> {
    if (this.page.nativeType) {
      try {
        await this.page.nativeType(text);
        return;
      } catch {
        // CDP type failed — fallback to JS
      }
    }
    await this.page.typeText(String(index), text);
  }

  // ── Type ────────────────────────────────────────────────────────────────

  private async executeType(
    action: Extract<AgentAction, { type: 'type' }>,
    elementMap: Map<number, ElementInfo>,
  ): Promise<ActionResult> {
    const el = elementMap.get(action.index);
    if (!el) {
      return { action, success: false, error: `Element [${action.index}] not found in current snapshot` };
    }

    // Click to focus the element first, then verify focus
    await this.clickElement(action.index, el);
    await this.page.wait(0.2);

    // Verify the element is actually focused — if not, force focus via JS
    const isFocused = await this.page.evaluate(`
      (function() {
        var el = document.querySelector('[data-opencli-ref="${action.index}"]');
        if (!el) return false;
        if (document.activeElement !== el) { el.focus(); }
        return document.activeElement === el;
      })()
    `) as boolean;
    if (!isFocused) {
      return { action, success: false, error: `Element [${action.index}] could not be focused` };
    }

    // Clear existing content — use JS selectAll to avoid macOS Cmd vs Ctrl issue
    await this.page.evaluate(`
      (function() {
        var el = document.querySelector('[data-opencli-ref="${action.index}"]');
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
          el.select();
        } else if (el) {
          document.execCommand('selectAll');
        }
      })()
    `);
    await this.page.wait(0.1);

    // Type the text
    await this.typeIntoElement(action.index, action.text);

    // Post-type value verification: check if the field actually has the expected value
    let mismatchNote = '';
    try {
      const actualValue = await this.page.evaluate(`
        (function() {
          var el = document.querySelector('[data-opencli-ref="${action.index}"]');
          return el ? (el.value || el.textContent || '').trim() : null;
        })()
      `) as string | null;
      if (actualValue !== null && actualValue !== action.text) {
        mismatchNote = `\n⚠️ Note: field's actual value "${actualValue}" differs from typed text "${action.text}". The page may have reformatted or autocompleted your input.`;
      }
    } catch { /* non-fatal */ }

    // Autocomplete fields: wait for JS dropdown to populate, then notify LLM
    if (el.isAutocomplete) {
      await this.page.wait(0.4);
      return {
        action,
        success: true,
        extractedContent: '⚠️ This is an autocomplete field. Wait for suggestions to appear (new elements marked with *[]), then click the correct suggestion instead of pressing Enter.' + mismatchNote,
      };
    }

    // Optionally press Enter
    if (action.pressEnter) {
      await this.page.wait(0.2);
      if (this.page.nativeKeyPress) {
        await this.page.nativeKeyPress('Enter');
      } else {
        await this.page.pressKey('Enter');
      }
    }

    return { action, success: true, extractedContent: mismatchNote || undefined };
  }

  // ── Navigate ────────────────────────────────────────────────────────────

  private async executeNavigate(
    action: Extract<AgentAction, { type: 'navigate' }>,
  ): Promise<ActionResult> {
    await this.page.goto(action.url);
    await this.page.wait(2);
    return { action, success: true };
  }

  // ── Scroll ──────────────────────────────────────────────────────────────

  private async executeScroll(
    action: Extract<AgentAction, { type: 'scroll' }>,
    elementMap: Map<number, ElementInfo>,
  ): Promise<ActionResult> {
    const amount = action.amount ?? 500;

    if (action.index !== undefined) {
      // Scroll within a specific element
      const el = elementMap.get(action.index);
      if (el) {
        const scrollAmount = action.direction === 'up' ? -amount : amount;
        await this.page.evaluate(`
          (function() {
            var els = document.querySelectorAll('[data-opencli-ref=' + ${JSON.stringify(String(action.index))} + ']');
            if (els[0]) els[0].scrollBy(0, ${JSON.stringify(scrollAmount)});
          })()
        `);
      }
    } else {
      await this.page.scroll(action.direction, amount);
    }

    await this.page.wait(0.5);
    return { action, success: true };
  }

  // ── Wait ────────────────────────────────────────────────────────────────

  private async executeWait(
    action: Extract<AgentAction, { type: 'wait' }>,
  ): Promise<ActionResult> {
    const seconds = Math.min(action.seconds ?? 2, 10); // Cap at 10s
    await this.page.wait(seconds);
    return { action, success: true };
  }

  // ── Extract ─────────────────────────────────────────────────────────────

  private async executeExtract(
    action: Extract<AgentAction, { type: 'extract' }>,
  ): Promise<ActionResult> {
    const content = await this.page.evaluate(`
      (function() {
        var body = document.body;
        if (!body) return '';
        return body.innerText.slice(0, 5000);
      })()
    `) as string;

    return {
      action,
      success: true,
      extractedContent: content || '(empty page)',
    };
  }

  // ── Go Back ─────────────────────────────────────────────────────────────

  private async executeGoBack(): Promise<ActionResult> {
    await this.page.evaluate('history.back()');
    await this.page.wait(2);
    return { action: { type: 'go_back' }, success: true };
  }

  // ── Press Key ───────────────────────────────────────────────────────────

  private async executePressKey(
    action: Extract<AgentAction, { type: 'press_key' }>,
  ): Promise<ActionResult> {
    if (this.page.nativeKeyPress) {
      try {
        await this.page.nativeKeyPress(action.key);
        await this.page.wait(0.5);
        return { action, success: true };
      } catch {
        // fallback
      }
    }
    await this.page.pressKey(action.key);
    await this.page.wait(0.5);
    return { action, success: true };
  }

  // ── Select Dropdown ─────────────────────────────────────────────────────

  private async executeSelectDropdown(
    action: Extract<AgentAction, { type: 'select_dropdown' }>,
    elementMap: Map<number, ElementInfo>,
  ): Promise<ActionResult> {
    const el = elementMap.get(action.index);
    if (!el) {
      return { action, success: false, error: `Element [${action.index}] not found` };
    }

    const indexStr = JSON.stringify(String(action.index));
    const optionText = JSON.stringify(action.option);
    const result = await this.page.evaluate(`
      (function() {
        var selects = document.querySelectorAll('[data-opencli-ref=' + ${indexStr} + ']');
        var sel = selects[0];
        if (!sel || sel.tagName !== 'SELECT') return { error: 'Not a <select> element' };
        var target = ${optionText};
        var opts = Array.from(sel.options);
        var match = opts.find(function(o) { return o.text.trim() === target || o.value === target; });
        if (!match) return { error: 'Option not found: ' + target, available: opts.map(function(o) { return o.text.trim(); }) };
        // Use native setter to trigger React/Vue/Angular change detection
        var nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (nativeSetter) { nativeSetter.call(sel, match.value); } else { sel.value = match.value; }
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { selected: match.text };
      })()
    `) as { error?: string; selected?: string; available?: string[] } | null;

    if (result?.error) {
      return { action, success: false, error: result.error + (result.available ? ` — Available: ${result.available.join(', ')}` : '') };
    }
    return { action, success: true };
  }

  // ── Tab Management ──────────────────────────────────────────────────────

  private async executeSwitchTab(
    action: Extract<AgentAction, { type: 'switch_tab' }>,
  ): Promise<ActionResult> {
    await this.page.selectTab(action.tabIndex);
    await this.page.wait(1);
    return { action, success: true };
  }

  private async executeOpenTab(
    action: Extract<AgentAction, { type: 'open_tab' }>,
  ): Promise<ActionResult> {
    await this.page.newTab();
    if (action.url) {
      await this.page.goto(action.url);
      await this.page.wait(2);
    }
    return { action, success: true };
  }

  private async executeCloseTab(): Promise<ActionResult> {
    await this.page.closeTab();
    return { action: { type: 'close_tab' }, success: true };
  }

  // ── Search Page ─────────────────────────────────────────────────────────

  private async executeSearchPage(
    action: Extract<AgentAction, { type: 'search_page' }>,
  ): Promise<ActionResult> {
    const query = JSON.stringify(action.query);
    const result = await this.page.evaluate(`
      (function() {
        var text = document.body.innerText;
        var query = ${query}.toLowerCase();
        var lines = text.split('\\n');
        var matches = [];
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            matches.push(lines[i].trim().slice(0, 200));
            if (matches.length >= 10) break;
          }
        }
        return { found: matches.length, matches: matches };
      })()
    `) as { found: number; matches: string[] } | null;

    if (!result || result.found === 0) {
      return { action, success: true, extractedContent: `No matches found for "${action.query}"` };
    }
    return { action, success: true, extractedContent: `Found ${result.found} matches:\n${result.matches.join('\n')}` };
  }
}
