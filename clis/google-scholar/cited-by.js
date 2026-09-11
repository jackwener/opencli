// google-scholar cited-by: list papers that cite a given paper (paginated).
//
// Two input modes:
//   1. --cluster-id <id>  — direct Google Scholar cluster id (the number in
//      "cites=<id>" URLs on result cards).
//   2. positional <query> — paper title; we search once, take the top hit's
//      "Cited by N" link, extract its cluster id, then list citing papers.
//
// Pagination follows Scholar's `start=<offset>` convention (10 per page).
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import { clampInt, requireNonEmptyQuery } from '../_shared/common.js';

cli({
    site: 'google-scholar',
    name: 'cited-by',
    access: 'read',
    description: 'List papers that cite a Google Scholar paper (paginated)',
    domain: 'scholar.google.com',
    strategy: Strategy.PUBLIC,
    browser: true,
    args: [
        { name: 'query', positional: true, required: false, help: 'Paper title (omit when --cluster-id is given)' },
        { name: 'cluster-id', type: 'string', help: 'Google Scholar cluster id (the number in cites=<id> links)' },
        { name: 'limit', type: 'int', default: 10, help: 'Max citing papers to return (1-100)' },
        { name: 'offset', type: 'int', default: 0, help: 'Result offset (0-based; Scholar pages are 10 each)' },
        { name: 'index', type: 'int', default: 1, help: 'Which search hit to use when querying by title (1-based)' },
    ],
    columns: ['rank', 'title', 'authors', 'source', 'year', 'cited', 'url'],
    func: async (page, kwargs) => {
        const limit = clampInt(kwargs.limit, 10, 1, 100);
        const offsetRaw = kwargs.offset ?? 0;
        const offset = typeof offsetRaw === 'number' ? offsetRaw : Number(offsetRaw);
        if (!Number.isInteger(offset) || offset < 0) {
            throw new ArgumentError('google-scholar cited-by offset must be a non-negative integer');
        }

        let clusterId = kwargs.clusterId ?? kwargs['cluster-id'] ?? kwargs.cluster_id;
        if (typeof clusterId === 'string') clusterId = clusterId.trim();
        if (clusterId && !/^\d+$/.test(clusterId)) {
            throw new ArgumentError('google-scholar cited-by --cluster-id must be all digits (the cites=<id> value)');
        }

        // Mode 2: resolve cluster id from a title search.
        if (!clusterId) {
            const query = requireNonEmptyQuery(kwargs.query);
            const index = Math.max(1, Number(kwargs.index ?? 1) || 1) - 1;
            await page.goto(`https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=en`);
            try {
                await page.wait({ selector: '.gs_r.gs_or.gs_scl', timeout: 5 });
            } catch {
                await page.wait(3);
            }
            const found = await page.evaluate(`(() => {
                const cards = document.querySelectorAll('.gs_r.gs_or.gs_scl');
                if (cards.length <= ${index}) return { ok: false, reason: 'no search result at index ${index + 1}' };
                const card = cards[${index}];
                const citeLink = card.querySelector('.gs_fl a[href*="cites="]');
                if (!citeLink) return { ok: false, reason: 'result ${index + 1} has no "Cited by" link (0 citations)' };
                const m = (citeLink.getAttribute('href') || '').match(/cites=(\\d+)/);
                if (!m) return { ok: false, reason: 'could not parse cluster id from Cited by link' };
                const titleEl = card.querySelector('.gs_rt a, h3 a');
                return {
                    ok: true,
                    clusterId: m[1],
                    title: (titleEl?.textContent || '').replace(/\\s+/g, ' ').trim(),
                    citedText: citeLink.textContent.trim(),
                };
            })()`);
            if (!found?.ok) {
                throw new EmptyResultError('google-scholar/cited-by', found?.reason || 'Could not resolve a cluster id from the search results');
            }
            clusterId = found.clusterId;
        }

        // Fetch cited-by page (single Scholar page = up to 10 rows; walk pages
        // until we satisfy limit or run out of "next").
        const items = [];
        let start = offset;
        let guard = 0;
        while (items.length < limit && guard < 12) {
            guard += 1;
            const url = `https://scholar.google.com/scholar?cites=${clusterId}&start=${start}&hl=en&as_sdt=2005&sciodt=0,5`;
            await page.goto(url);
            try {
                await page.wait({ selector: '.gs_r.gs_or.gs_scl', timeout: 5 });
            } catch {
                await page.wait(2);
            }
            const wrapper = await page.evaluate(`
      (() => {
        const normalize = v => (v || '').replace(/\\s+/g, ' ').trim();
        const results = [];
        const resultCards = Array.from(document.querySelectorAll('.gs_r.gs_or.gs_scl'));
        for (const el of resultCards) {
          const container = el.querySelector('.gs_ri') || el;
          const titleEl = container.querySelector('.gs_rt a, h3 a');
          const title = normalize(titleEl?.textContent);
          if (!title) continue;

          const url = titleEl?.getAttribute('href') || '';
          const infoLine = normalize(container.querySelector('.gs_a')?.textContent);
          const parts = infoLine.split(' - ');
          const authors = (parts[0] || '').trim();
          const sourceParts = (parts[1] || '').split(',');
          const source = sourceParts.slice(0, -1).join(',').trim() || sourceParts[0]?.trim() || '';
          const year = infoLine.match(/(19|20)\\d{2}/)?.[0] || '';
          const citedText = normalize(container.querySelector('.gs_fl a[href*="cites"]')?.textContent);
          const cited = citedText.match(/(\\d+)/)?.[1] || '0';

          results.push({
            title,
            authors: authors.slice(0, 80),
            source: source.slice(0, 60),
            year,
            cited,
            url,
          });
        }
        return {
          items: results,
          resultCount: resultCards.length,
          hasNext: !!document.querySelector('.gs_ico_nav_next')?.closest('a'),
        };
      })()
    `);
            if (!wrapper || typeof wrapper !== 'object' || !Array.isArray(wrapper.items)) {
                throw new CommandExecutionError('Google Scholar cited-by returned an unexpected payload shape');
            }
            for (const row of wrapper.items) {
                items.push(row);
                if (items.length >= limit) break;
            }
            if (!wrapper.hasNext || wrapper.items.length === 0) break;
            start += 10;
        }

        if (items.length === 0) {
            throw new EmptyResultError('google-scholar/cited-by', `No citing papers found for cluster id ${clusterId} at offset ${offset}. Check the id or try a lower offset.`);
        }

        return items.map((row, i) => ({ rank: offset + i + 1, ...row }));
    },
});
