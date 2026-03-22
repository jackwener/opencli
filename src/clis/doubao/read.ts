import { cli, Strategy } from '../../registry.js';

export const readCommand = cli({
  site: 'doubao',
  name: 'read',
  description: 'Read chat history from Doubao AI',
  domain: 'doubao',
  strategy: Strategy.UI,
  browser: true,
  columns: ['Role', 'Text'],
  func: async (page) => {
    const messages = await page.evaluate(`
      (function() {
        const results = [];
        const msgContainers = document.querySelectorAll('[data-testid="message_content"]');
        
        for (const container of msgContainers) {
          const textEl = container.querySelector('[data-testid="message_text_content"]');
          if (!textEl) continue;
          
          // Skip if still streaming (indicator present or show-indicator="true")
          const isStreaming = textEl.querySelector('[data-testid="indicator"]') !== null ||
                             textEl.getAttribute('data-show-indicator') === 'true';
          if (isStreaming) continue;
          
          const isUser = container.classList.contains('justify-end');
          
          // Get text content from markdown body
          let text = '';
          const children = textEl.querySelectorAll('div[dir]');
          if (children.length > 0) {
            text = Array.from(children).map(c => c.innerText || c.textContent || '').join('');
          } else {
            text = textEl.innerText?.trim() || textEl.textContent?.trim() || '';
          }
          
          if (!text) continue;
          
          results.push({
            role: isUser ? 'User' : 'Assistant',
            text: text.substring(0, 2000)
          });
        }
        
        return results;
      })()
    `);

    if (!messages || messages.length === 0) {
      return [{ Role: 'System', Text: 'No conversation found' }];
    }

    return messages.map((m: any) => ({ Role: m.role, Text: m.text }));
  },
});