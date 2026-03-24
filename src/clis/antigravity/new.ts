import { cli, Strategy } from '../../registry.js';
import { SelectorError } from '../../errors.js';

export const newCommand = cli({
  site: 'antigravity',
  name: 'new',
  description: 'Start a new conversation / clear context in Antigravity',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [],
  columns: ['status'],
  func: async (page) => {
    try {
      await page.evaluate(`
        async () => {
          const btn = document.querySelector('[data-tooltip-id="new-conversation-tooltip"]');
          if (!btn) throw new Error('Could not find New Conversation button');

          // In case it's disabled, we must check, but we'll try to click it anyway
          btn.click();
        }
      `);
    } catch (e: any) {
      if (e.message?.includes('Could not find New Conversation button')) {
        throw new SelectorError('New Conversation button', 'Could not find New Conversation button in Antigravity UI');
      }
      throw e;
    }

    // Give it a moment to reset the UI
    await page.wait(0.5);

    return [{ status: 'Successfully started a new conversation' }];
  },
});
