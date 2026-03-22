import { cli, Strategy } from '../../registry.js';

export const sendCommand = cli({
  site: 'doubao',
  name: 'send',
  description: 'Send a message to Doubao AI chat',
  domain: 'doubao',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'text', required: true, positional: true, help: 'Message text to send' },
  ],
  columns: ['Status', 'Text'],
  func: async (page, kwargs) => {
    const text = kwargs.text as string;

    // Doubao uses data-testid="chat_input_input" for the textarea
    const injected = await page.evaluate(
      `(function(t) {
        const textarea = document.querySelector('[data-testid="chat_input_input"]');
        if (!textarea) return { ok: false, error: 'No textarea found' };
        
        textarea.focus();
        
        // Set value directly and dispatch events
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(textarea, t);
        } else {
          textarea.value = t;
        }
        
        // Dispatch input event (needed for React/Semi UI to detect change)
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        
        return { ok: true };
      })(${JSON.stringify(text)})`
    );

    if (!injected || !injected.ok) {
      throw new Error('Could not find chat input element: ' + (injected?.error || 'unknown error'));
    }

    await page.wait(0.5);

    // Click the send button instead of pressing Enter
    const clicked = await page.evaluate(`
      (function() {
        const btn = document.querySelector('[data-testid="chat_input_send_button"]');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);

    if (!clicked) {
      // Fallback: try pressing Enter
      await page.pressKey('Enter');
    }

    await page.wait(1);

    return [{ Status: 'Sent', Text: text }];
  },
});