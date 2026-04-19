import { EmptyResultError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { extractScysArticle } from './extractors.js';

function isRetryableScysArticleError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return error instanceof EmptyResultError
        || /stale page identity/i.test(message)
        || /Page not found:/i.test(message)
        || /Article detail page did not hydrate beyond shell content/i.test(message);
}
cli({
    site: 'scys',
    name: 'article',
    description: 'Extract SCYS article detail page content and metadata',
    domain: 'scys.com',
    strategy: Strategy.COOKIE,
    navigateBefore: false,
    args: [
        { name: 'url', required: true, positional: true, help: 'Article URL or topic id: /articleDetail/<entityType>/<topicId>' },
        { name: 'wait', type: 'int', default: 5, help: 'Seconds to wait after page load' },
        { name: 'max-length', type: 'int', default: 4000, help: 'Max content length for long text fields' },
    ],
    columns: ['topic_id', 'entity_type', 'title', 'author', 'time', 'tags', 'flags', 'image_count', 'external_link_count', 'content', 'ai_summary', 'url'],
    func: async (page, kwargs) => {
        const url = String(kwargs.url);
        const options = {
            waitSeconds: Number(kwargs.wait ?? 5),
            maxLength: Number(kwargs['max-length'] ?? 4000),
        };
        let lastError = null;
        const maxAttempts = 5;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await extractScysArticle(page, url, options);
            } catch (error) {
                lastError = error;
                if (!isRetryableScysArticleError(error) || attempt === maxAttempts) {
                    throw error;
                }
                // A full window reset is closer to the successful manual re-run path
                // than another probe inside the same browser state.
                await page.closeWindow?.().catch(() => { });
            }
        }
        throw lastError;
    },
});
