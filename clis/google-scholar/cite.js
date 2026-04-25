import { cli, Strategy } from '@jackwener/opencli/registry';
import { requireNonEmptyQuery } from '../_shared/common.js';

cli({
    site: 'google-scholar',
    name: 'cite',
    description: 'Get citation for a Google Scholar paper',
    domain: 'scholar.google.com',
    strategy: Strategy.PUBLIC,
    browser: true,
    args: [
        { name: 'query', positional: true, required: true, help: 'Paper title to search for' },
        { name: 'style', default: 'bibtex', choices: ['bibtex', 'endnote', 'refman', 'refworks'], help: 'Citation format' },
        { name: 'index', type: 'int', default: 1, help: 'Which search result to cite (1-based)' },
    ],
    columns: ['title', 'format', 'citation'],
    navigateBefore: false,
    func: async (page, kwargs) => {
        const query = requireNonEmptyQuery(kwargs.query);
        const format = kwargs.style || 'bibtex';
        const index = Math.max(1, kwargs.index || 1) - 1;

        await page.goto(`https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=en`);
        await page.wait(3);

        const clicked = await page.evaluate(`(() => {
            var cites = document.querySelectorAll('a.gs_or_cit');
            if (cites.length <= ${index}) return { ok: false, reason: 'result not found at index ${index + 1}' };
            var titleEl = document.querySelectorAll('.gs_r.gs_or.gs_scl')[${index}];
            var title = '';
            if (titleEl) {
                var t = titleEl.querySelector('.gs_rt a, h3 a');
                title = t ? t.textContent.trim() : '';
            }
            cites[${index}].click();
            return { ok: true, title: title };
        })()`);

        if (!clicked?.ok) return [{ title: '-', format: format, citation: clicked?.reason || 'cite button not found' }];

        await page.wait(2);

        const formatMap = { bibtex: 'BibTeX', endnote: 'EndNote', refman: 'RefMan', refworks: 'RefWorks' };
        const formatLabel = formatMap[format] || 'BibTeX';

        const citeUrl = await page.evaluate(`(() => {
            var links = document.querySelectorAll('#gs_cit a.gs_citi');
            for (var i = 0; i < links.length; i++) {
                if (links[i].textContent.trim() === '${formatLabel}') return links[i].href;
            }
            return null;
        })()`);

        if (!citeUrl) return [{ title: clicked.title, format: format, citation: 'citation link not found' }];

        await page.goto(citeUrl);
        await page.wait(2);

        const citation = await page.evaluate(`(() => {
            return (document.body.innerText || '').trim();
        })()`);

        return [{ title: clicked.title, format: format, citation: citation || 'empty response' }];
    },
});
