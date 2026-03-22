import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

export const askCommand = cli({
  site: 'doubao',
  name: 'ask',
  description: 'Send a message to Doubao and wait for the AI response',
  domain: 'doubao',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'text', required: true, positional: true, help: 'Prompt to send' },
    { name: 'timeout', required: false, default: '30', help: 'Max seconds to wait for response (default: 30)' },
  ],
  columns: ['Role', 'Text'],
  func: async (page: IPage, kwargs: any) => {
    const text = kwargs.text as string;
    const timeout = parseInt(kwargs.timeout as string, 10) || 30;

    // Count existing messages before sending
    const beforeCount = await page.evaluate(`
      document.querySelectorAll('[data-testid="message_content"]').length
    `);

    // Inject text
    const injected = await page.evaluate(
      `(function(t) {
        const textarea = document.querySelector('[data-testid="chat_input_input"]');
        if (!textarea) return false;
        
        textarea.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(textarea, t);
        } else {
          textarea.value = t;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })(${JSON.stringify(text)})`
    );

    if (!injected) throw new Error('Could not find chat input element.');
    await page.wait(0.5);

    // Click send button
    const clicked = await page.evaluate(`
      (function() {
        const btn = document.querySelector('[data-testid="chat_input_send_button"]');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    if (!clicked) await page.pressKey('Enter');

    // Poll: first wait for assistant message to appear, then wait for streaming to finish
    const pollInterval = 1;
    const maxPolls = Math.ceil(timeout / pollInterval);
    let response = '';
    let phase: 'waiting' | 'streaming' = 'waiting';

    for (let i = 0; i < maxPolls; i++) {
      await page.wait(pollInterval);

      const result = await page.evaluate(
        `(function(prevCount) {
          const msgs = document.querySelectorAll('[data-testid="message_content"]');
          
          // Phase 1: wait for new assistant message
          if (msgs.length <= prevCount) {
            return { phase: 'waiting', text: null };
          }
          
          const lastMsg = msgs[msgs.length - 1];
          const isUser = lastMsg.classList.contains('justify-end');
          if (isUser) {
            return { phase: 'waiting', text: null }; // Still waiting for assistant
          }
          
          const textEl = lastMsg.querySelector('[data-testid="message_text_content"]');
          if (!textEl) return { phase: 'waiting', text: null };
          
          // Check if still streaming
          const isStreaming = textEl.querySelector('[data-testid="indicator"]') !== null ||
                             textEl.getAttribute('data-show-indicator') === 'true';
          
          if (isStreaming) {
            // Get partial text
            let text = '';
            const children = textEl.querySelectorAll('div[dir]');
            if (children.length > 0) {
              text = Array.from(children).map(c => c.innerText || c.textContent || '').join('');
            } else {
              text = textEl.innerText?.trim() || textEl.textContent?.trim() || '';
            }
            return { phase: 'streaming', text: text.substring(0, 100) };
          }
          
          // Streaming complete - get full text
          let text = '';
          const children = textEl.querySelectorAll('div[dir]');
          if (children.length > 0) {
            text = Array.from(children).map(c => c.innerText || c.textContent || '').join('');
          } else {
            text = textEl.innerText?.trim() || textEl.textContent?.trim() || '';
          }
          
          return { phase: 'done', text };
        })(${beforeCount})`
      );

      if (!result) continue;

      if (result.phase === 'done' && result.text) {
        response = result.text;
        break;
      } else if (result.phase === 'streaming') {
        // Stay in streaming phase, continue polling
        phase = 'streaming';
      } else {
        phase = 'waiting';
      }
    }

    if (!response) {
      return [
        { Role: 'User', Text: text },
        { Role: 'System', Text: `No response received within ${timeout}s.` },
      ];
    }

    return [
      { Role: 'User', Text: text },
      { Role: 'Assistant', Text: response },
    ];
  },
});