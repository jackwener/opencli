import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

cli({
  site: 'twitter',
  name: 'post',
  description: 'Post a new tweet/thread',
  domain: 'x.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'text', type: 'string', required: true, help: 'The text content of the tweet' },
  ],
  columns: ['status', 'message', 'text'],
  func: async (page: IPage | null, kwargs: any) => {
    if (!page) throw new Error('Requires browser');

    // 1. Navigate directly to the compose tweet modal
    await page.goto('https://x.com/compose/tweet');
    await page.wait(3); // Wait for the modal and React app to hydrate

    // 2. Automate typing and clicking
    const result = await page.evaluate(`(async () => {
        try {
            // Find the active text area
            const box = document.querySelector('[data-testid="tweetTextarea_0"]');
            if (box) {
                box.focus();
                // insertText is the most reliable way to trigger React's onChange events
                document.execCommand('insertText', false, ${JSON.stringify(kwargs.text)});
            } else {
                return { ok: false, message: 'Could not find the tweet composer text area.' };
            }
            
            // Wait a brief moment for the button state to update
            await new Promise(r => setTimeout(r, 1000));
            
            // Click the post button
            const btn = document.querySelector('[data-testid="tweetButton"]');
            if (btn && !btn.disabled) {
                btn.click();
                return { ok: true, message: 'Tweet posted successfully.' };
            } else {
                // Sometimes it's rendered inline depending on the viewport
                const inlineBtn = document.querySelector('[data-testid="tweetButtonInline"]');
                if (inlineBtn && !inlineBtn.disabled) {
                    inlineBtn.click();
                    return { ok: true, message: 'Tweet posted successfully.' };
                }
                return { ok: false, message: 'Tweet button is disabled or not found.' };
            }
        } catch (e) {
            return { ok: false, message: e.toString() };
        }
    })()`);

    // 3. Wait a few seconds for the network request to finish sending
    if (result.ok) {
        await page.wait(3);
    }

    return [{
        status: result.ok ? 'success' : 'failed',
        message: result.message,
        text: kwargs.text
    }];
  }
});
