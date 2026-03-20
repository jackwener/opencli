import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

export const askCommand = cli({
  site: 'perplexity',
  name: 'ask',
  description: 'Ask Perplexity AI and get a sourced answer',
  domain: 'www.perplexity.ai',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'prompt', type: 'string', required: true },
    { name: 'timeout', type: 'int', default: 120 },
  ],
  columns: ['response'],
  func: async (page: IPage, kwargs: Record<string, any>) => {
    const prompt = kwargs.prompt as string;
    const timeoutMs = ((kwargs.timeout as number) || 120) * 1000;

    await page.goto('https://www.perplexity.ai');
    await page.wait(3);

    const promptJson = JSON.stringify(prompt);

    const sendResult = await page.evaluate(`(async () => {
      try {
        const ta = document.querySelector('textarea');
        if (!ta) return { ok: false, msg: 'no textarea' };
        ta.focus();
        ta.value = '';
        document.execCommand('selectAll');
        document.execCommand('insertText', false, ${promptJson});
        await new Promise(r => setTimeout(r, 800));
        const btn = document.querySelector('button[aria-label="Submit"]')
          || document.querySelector('button[aria-label="Ask"]')
          || [...document.querySelectorAll('button[type="submit"], button')].find(b =>
            !b.disabled && b.querySelector('svg') && b.closest('form, [role="search"]'));
        if (btn && !btn.disabled) { btn.click(); return { ok: true }; }
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return { ok: true, msg: 'enter' };
      } catch (e) { return { ok: false, msg: e.toString() }; }
    })()`);

    if (!sendResult?.ok) {
      return [{ response: '[SEND FAILED] ' + JSON.stringify(sendResult) }];
    }

    const startTime = Date.now();
    let lastText = '';
    let stableCount = 0;

    while (Date.now() - startTime < timeoutMs) {
      await page.wait(3);
      const response = await page.evaluate(`(() => {
        const answers = document.querySelectorAll('[class*="prose"], [class*="answer"], [class*="response"]');
        if (answers.length) {
          const last = answers[answers.length - 1];
          return (last.innerText || '').trim();
        }
        return '';
      })()`);

      if (response && response.length > 2) {
        if (response === lastText) {
          stableCount++;
          if (stableCount >= 2) return [{ response }];
        } else {
          stableCount = 0;
        }
      }
      lastText = response || '';
    }

    if (lastText) return [{ response: lastText }];
    return [{ response: '[NO RESPONSE]' }];
  },
});
