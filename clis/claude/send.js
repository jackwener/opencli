import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { CLAUDE_DOMAIN, CLAUDE_URL, ensureOnClaude, sendMessage, parseBoolFlag, withRetry } from './utils.js';

export const sendCommand = cli({
    site: 'claude',
    name: 'send',
    description: 'Send a prompt to Claude without waiting for the response',
    domain: CLAUDE_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'prompt', positional: true, required: true, help: 'Prompt to send' },
        { name: 'new', type: 'boolean', default: false, help: 'Start a new chat before sending' },
    ],
    columns: ['Status', 'SubmittedBy', 'InjectedText'],

    func: async (page, kwargs) => {
        const prompt = kwargs.prompt;

        if (parseBoolFlag(kwargs.new)) {
            await page.goto(CLAUDE_URL);
            await page.wait(3);
        } else {
            await ensureOnClaude(page);
            await page.wait(2);
        }

        const sendResult = await withRetry(() => sendMessage(page, prompt));
        if (!sendResult?.ok) {
            throw new CommandExecutionError(sendResult?.reason || 'Failed to send message');
        }
        return [{
            Status: 'Success',
            SubmittedBy: sendResult.method || 'send-button',
            InjectedText: prompt,
        }];
    },
});
