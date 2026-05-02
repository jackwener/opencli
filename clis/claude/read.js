import { cli, Strategy } from '@jackwener/opencli/registry';
import { CLAUDE_DOMAIN, ensureOnClaude, getVisibleMessages } from './utils.js';

export const readCommand = cli({
    site: 'claude',
    name: 'read',
    description: 'Read the current Claude conversation',
    domain: CLAUDE_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [],
    columns: ['Index', 'Role', 'Text'],

    func: async (page) => {
        await ensureOnClaude(page);
        await page.wait(3);
        const messages = await getVisibleMessages(page);
        if (messages.length > 0) return messages;
        return [{ Index: 0, Role: 'system', Text: 'No visible messages found.' }];
    },
});
