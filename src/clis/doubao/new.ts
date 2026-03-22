import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

export const newCommand = cli({
  site: 'doubao',
  name: 'new',
  description: 'Start a new chat in Doubao AI',
  domain: 'doubao',
  strategy: Strategy.UI,
  browser: true,
  args: [],
  columns: ['Status'],
  func: async (page: IPage) => {
    // Try clicking the new chat button first
    const clicked = await page.evaluate(`
      (function() {
        // Try new_chat_button first (in the chat area)
        let btn = document.querySelector('[data-testid="new_chat_button"]');
        if (btn) { btn.click(); return true; }
        
        // Try app-open-newChat (in sidebar)
        btn = document.querySelector('[data-testid="app-open-newChat"]');
        if (btn) { btn.click(); return true; }
        
        return false;
      })()
    `);

    if (!clicked) {
      await page.pressKey('Meta+N');
    }
    await page.wait(3);
    return [{ Status: 'Success' }];
  },
});