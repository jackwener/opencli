import { cli, Strategy } from '../../registry.js';

export const statusCommand = cli({
  site: 'doubao',
  name: 'status',
  description: 'Check CDP connection to Doubao AI chat app',
  domain: 'doubao',
  strategy: Strategy.UI,
  browser: true,
  args: [],
  columns: ['Status', 'Url', 'Title'],
  func: async (page) => {
    const url = await page.evaluate('window.location.href');
    const title = await page.evaluate('document.title');
    return [{ Status: 'Connected', Url: url, Title: title }];
  },
});