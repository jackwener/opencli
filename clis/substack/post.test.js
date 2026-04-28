import { afterEach, describe, expect, it } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './post.js';
import { __test__ } from './post.js';

const { parsePostUrl, formatBody } = __test__;

describe('substack post registration', () => {
    it('registers substack/post with expected shape', () => {
        const cmd = getRegistry().get('substack/post');
        expect(cmd?.func).toBeTypeOf('function');
        expect(cmd?.name).toBe('post');
        const urlArg = cmd?.args?.find((a) => a.name === 'url');
        expect(urlArg?.positional).toBe(true);
        expect(urlArg?.required).toBe(true);
        for (const col of ['title', 'subtitle', 'author', 'date', 'url', 'body']) {
            expect(cmd?.columns).toContain(col);
        }
    });
});

describe('parsePostUrl', () => {
    it('parses a standard subdomain post URL', () => {
        expect(parsePostUrl('https://technosapiens.substack.com/p/how-to-talk-to-strangers'))
            .toEqual({ origin: 'https://technosapiens.substack.com', slug: 'how-to-talk-to-strangers' });
    });

    it('strips query string and trailing slash', () => {
        expect(parsePostUrl('https://foo.substack.com/p/my-slug/?utm_source=x'))
            .toEqual({ origin: 'https://foo.substack.com', slug: 'my-slug' });
    });

    it('supports custom domains', () => {
        expect(parsePostUrl('https://example.com/p/slug'))
            .toEqual({ origin: 'https://example.com', slug: 'slug' });
    });

    it('rejects non-/p/ paths', () => {
        expect(() => parsePostUrl('https://foo.substack.com/archive')).toThrow(/Not a Substack post URL/);
    });

    it('rejects garbage input', () => {
        expect(() => parsePostUrl('not-a-url')).toThrow(/Not a Substack post URL/);
    });
});

describe('formatBody', () => {
    it('converts HTML to markdown by default', () => {
        expect(formatBody('<p>hi <b>there</b></p>', 'md')).toMatch(/hi \*\*there\*\*/);
    });

    it('strips tags for plain', () => {
        expect(formatBody('<p>hi <b>there</b></p>', 'plain')).toBe('hi there');
    });

    it('returns html as-is for html', () => {
        expect(formatBody('<p>x</p>', 'html')).toBe('<p>x</p>');
    });

    it('returns empty string for empty input', () => {
        expect(formatBody('', 'md')).toBe('');
    });
});

describe('substack/post func', () => {
    const origFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = origFetch; });

    it('fetches the post API and returns a single row', async () => {
        const canned = {
            title: 'Hello World',
            subtitle: 'a subtitle',
            post_date: '2025-01-02T03:04:05.000Z',
            canonical_url: 'https://foo.substack.com/p/hello',
            publishedBylines: [{ name: 'Jane' }],
            body_html: '<p>Body <b>text</b></p>',
        };
        const calls = [];
        globalThis.fetch = async (u) => {
            calls.push(u);
            return { ok: true, status: 200, json: async () => canned };
        };

        const cmd = getRegistry().get('substack/post');
        const rows = await cmd.func(null, { url: 'https://foo.substack.com/p/hello', format: 'md' });

        expect(calls).toHaveLength(1);
        expect(calls[0]).toBe('https://foo.substack.com/api/v1/posts/hello');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            title: 'Hello World',
            subtitle: 'a subtitle',
            author: 'Jane',
            date: '2025-01-02',
            url: 'https://foo.substack.com/p/hello',
        });
        expect(rows[0].body).toMatch(/Body \*\*text\*\*/);
    });

    it('throws on HTTP error', async () => {
        globalThis.fetch = async () => ({ ok: false, status: 404 });
        const cmd = getRegistry().get('substack/post');
        await expect(cmd.func(null, { url: 'https://foo.substack.com/p/x', format: 'md' }))
            .rejects.toThrow(/HTTP 404/);
    });
});
