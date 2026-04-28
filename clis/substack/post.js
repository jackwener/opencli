import TurndownService from 'turndown';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';

function headers() {
    return {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
    };
}

function trim(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function parsePostUrl(input) {
    let parsed;
    try {
        parsed = new URL(input);
    }
    catch {
        throw new CommandExecutionError(`Not a Substack post URL: ${input}`);
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || parts[0] !== 'p' || !parts[1]) {
        throw new CommandExecutionError(`Not a Substack post URL: ${input}`);
    }
    return { origin: parsed.origin, slug: parts[1] };
}

function formatBody(html, format) {
    if (!html)
        return '';
    if (format === 'html')
        return html;
    if (format === 'plain')
        return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
    return td.turndown(html);
}

async function fetchPost(origin, slug) {
    const url = `${origin}/api/v1/posts/${encodeURIComponent(slug)}`;
    const resp = await fetch(url, { headers: headers() });
    if (!resp.ok)
        throw new CommandExecutionError(`Substack post fetch failed: HTTP ${resp.status}`);
    return resp.json();
}

cli({
    site: 'substack',
    name: 'post',
    description: '获取单篇 Substack 文章正文（md/html/plain）',
    domain: 'substack.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'url', required: true, positional: true, help: '文章 URL（如 https://example.substack.com/p/slug）' },
        { name: 'body-format', default: 'md', choices: ['md', 'html', 'plain'], help: '输出正文格式（避免与 opencli 内建 -f/--format 撞名）' },
    ],
    columns: ['title', 'subtitle', 'author', 'date', 'url', 'body'],
    func: async (_page, args) => {
        const { origin, slug } = parsePostUrl(args.url);
        const format = args['body-format'] || args.bodyFormat || 'md';
        const data = await fetchPost(origin, slug);
        const date = trim(data?.post_date).split('T')[0] || trim(data?.post_date);
        return [{
            title: trim(data?.title),
            subtitle: trim(data?.subtitle),
            author: trim(data?.publishedBylines?.[0]?.name),
            date,
            url: trim(data?.canonical_url) || args.url,
            body: formatBody(data?.body_html || '', format),
        }];
    },
});

export const __test__ = { parsePostUrl, formatBody };
