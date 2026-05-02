import { cli, Strategy } from '@jackwener/opencli/registry';
import { CLAUDE_DOMAIN, getVisibleMessages } from './utils.js';

export const detailCommand = cli({
    site: 'claude',
    name: 'detail',
    description: 'Open a Claude conversation by ID and read its messages',
    domain: CLAUDE_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'id', positional: true, required: true, help: 'Conversation ID (UUID from /chat/<id>)' },
    ],
    columns: ['Index', 'Role', 'Text'],

    func: async (page, kwargs) => {
        const id = String(kwargs.id || '').trim();
        if (!id) return [{ Index: 0, Role: 'system', Text: 'Conversation id is required.' }];

        await page.goto(`https://claude.ai/chat/${id}`);
        await page.wait(4);

        const messages = await getVisibleMessages(page);
        if (messages.length > 0) return messages;
        return [{ Index: 0, Role: 'system', Text: 'No visible messages found.' }];
    },
});
