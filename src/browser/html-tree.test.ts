import { describe, expect, it } from 'vitest';
import { buildHtmlTreeJs, type HtmlTreeResult } from './html-tree.js';

/**
 * The serializer runs in a page context via `page.evaluate`. In unit tests we
 * substitute `document` with a minimal stub that mirrors the DOM surface used
 * by the expression, then Function-eval the returned JS.
 */
function runTreeJs(root: unknown, selectorMatches: unknown[], selector: string | null): HtmlTreeResult {
    const js = buildHtmlTreeJs({ selector });
    const fakeDocument = {
        querySelectorAll: () => selectorMatches,
        documentElement: root,
    };
    const fn = new Function('document', `return ${js};`);
    return fn(fakeDocument) as HtmlTreeResult;
}

function runTreeJsInvalid(selector: string, errorMessage: string): unknown {
    const js = buildHtmlTreeJs({ selector });
    const fakeDocument = {
        querySelectorAll: () => { const e = new Error(errorMessage); e.name = 'SyntaxError'; throw e; },
        documentElement: null,
    };
    const fn = new Function('document', `return ${js};`);
    return fn(fakeDocument);
}

function el(tag: string, attrs: Record<string, string>, children: Array<ChildOf>): FakeEl {
    return {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
        childNodes: children,
    };
}

function txt(value: string): FakeText { return { nodeType: 3, nodeValue: value }; }

type FakeEl = { nodeType: 1; tagName: string; attributes: Array<{ name: string; value: string }>; childNodes: Array<ChildOf> };
type FakeText = { nodeType: 3; nodeValue: string };
type ChildOf = FakeEl | FakeText;

describe('buildHtmlTreeJs', () => {
    it('serializes a simple element into {tag, attrs, text, children}', () => {
        const root = el('div', { class: 'hero', id: 'x' }, [txt('Hello')]);
        const result = runTreeJs(root, [root], null);
        expect(result.selector).toBeNull();
        expect(result.matched).toBe(1);
        expect(result.tree).toEqual({
            tag: 'div',
            attrs: { class: 'hero', id: 'x' },
            text: 'Hello',
            children: [],
        });
    });

    it('collapses whitespace in direct text content only', () => {
        const root = el('p', {}, [
            txt('  line  \n  one  '),
            el('span', {}, [txt('inner text')]),
            txt('\tline two\t'),
        ]);
        const result = runTreeJs(root, [root], null);
        expect(result.tree?.text).toBe('line one line two');
        expect(result.tree?.children[0].text).toBe('inner text');
    });

    it('recurses into element children and preserves their attrs', () => {
        const root = el('ul', { role: 'list' }, [
            el('li', { 'data-id': '1' }, [txt('first')]),
            el('li', { 'data-id': '2' }, [txt('second')]),
        ]);
        const result = runTreeJs(root, [root], null);
        expect(result.tree?.children).toHaveLength(2);
        expect(result.tree?.children[0]).toEqual({
            tag: 'li',
            attrs: { 'data-id': '1' },
            text: 'first',
            children: [],
        });
    });

    it('returns matched=N and serializes only the first match', () => {
        const first = el('article', { id: 'a' }, [txt('first')]);
        const second = el('article', { id: 'b' }, [txt('second')]);
        const result = runTreeJs(null, [first, second], 'article');
        expect(result.matched).toBe(2);
        expect(result.tree?.attrs.id).toBe('a');
    });

    it('returns tree=null and matched=0 when selector matches nothing', () => {
        const result = runTreeJs(null, [], '.nothing');
        expect(result.matched).toBe(0);
        expect(result.tree).toBeNull();
    });

    it('catches SyntaxError from querySelectorAll and returns {invalidSelector:true, reason}', () => {
        const result = runTreeJsInvalid('##$@@', "'##$@@' is not a valid selector") as {
            selector: string;
            invalidSelector: boolean;
            reason: string;
        };
        expect(result.invalidSelector).toBe(true);
        expect(result.selector).toBe('##$@@');
        expect(result.reason).toContain('not a valid selector');
    });
});
