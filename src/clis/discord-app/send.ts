import { cli, Strategy } from '../../registry.js';
import { SelectorError } from '../../errors.js';
import type { IPage } from '../../types.js';

export const sendCommand = cli({
  site: 'discord-app',
  name: 'send',
  description: 'Send a message in the active Discord channel',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [{ name: 'text', required: true, positional: true, help: 'Message to send' }],
  columns: ['Status'],
  func: async (page: IPage, kwargs: any) => {
    const text = kwargs.text as string;

    try {
      await page.evaluate(`
        (function(text) {
          // Discord uses a Slate-based editor with [data-slate-editor="true"] or role="textbox"
          const editor = document.querySelector('[role="textbox"][data-slate-editor="true"], [class*="slateTextArea"]');
          if (!editor) throw new Error('Could not find Discord message input. Make sure a channel is open.');

          editor.focus();
          document.execCommand('insertText', false, text);
        })(${JSON.stringify(text)})
      `);
    } catch (e: any) {
      if (e.message?.includes('Could not find Discord message input')) {
        throw new SelectorError('Discord message input', 'Could not find Discord message input. Make sure a channel is open.');
      }
      throw e;
    }

    await page.wait(0.3);
    await page.pressKey('Enter');

    return [{ Status: 'Success' }];
  },
});
