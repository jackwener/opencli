import { AuthRequiredError, SelectorError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { isEmptyListsState, parseListCards } from './lists-parser.js';

cli({
    site: 'twitter',
    name: 'lists',
    description: 'Get Twitter/X lists for a user',
    domain: 'x.com',
    strategy: Strategy.COOKIE,
    browser: true,
    args: [
        { name: 'user', positional: true, type: 'string', required: false },
        { name: 'limit', type: 'int', default: 50 },
    ],
    columns: ['name', 'members', 'followers', 'mode'],
    func: async (page, kwargs) => {
        let targetUser = kwargs.user;
        if (!targetUser) {
            await page.goto('https://x.com/home');
            await page.wait({ selector: '[data-testid="primaryColumn"]' });
            const href = await page.evaluate(`() => {
            const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
            return link ? link.getAttribute('href') : null;
        }`);
            if (!href) {
                throw new AuthRequiredError('x.com', 'Could not find logged-in user profile link. Are you logged in?');
            }
            targetUser = href.replace('/', '');
        }
        await page.goto(`https://x.com/${targetUser}/lists`);
        await page.wait(3);
        const pageData = await page.evaluate(`() => {
            const cards = [];
            const seen = new Set();
            for (const anchor of Array.from(document.querySelectorAll('a[href*="/i/lists/"]'))) {
                const href = anchor.getAttribute('href') || '';
                if (!/\\/i\\/lists\\/\\d+/.test(href) || seen.has(href)) continue;
                seen.add(href);
                const container = anchor.closest('[data-testid="cellInnerDiv"]') || anchor;
                const text = (container.innerText || anchor.innerText || '').trim();
                if (!text) continue;
                cards.push({ href, text });
            }
            return {
                cards,
                pageText: document.body.innerText || '',
            };
        }`);
        if (!pageData?.pageText) {
            throw new SelectorError('Twitter lists', 'Empty page text');
        }
        const results = parseListCards(pageData.cards);
        if (results.length === 0) {
            if (isEmptyListsState(pageData.pageText)) {
                return [];
            }
            throw new SelectorError('Twitter lists', `Could not parse list data`);
        }
        return results.slice(0, kwargs.limit);
    }
});
