import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { runInNewContext } from 'node:vm';

const mocks = vi.hoisted(() => ({ cli: vi.fn(), downloadArticle: vi.fn() }));
vi.mock('@jackwener/opencli/registry', () => ({ cli: mocks.cli, Strategy: { COOKIE: 'cookie' } }));
vi.mock('@jackwener/opencli/download/article-download', () => ({ downloadArticle: mocks.downloadArticle }));

import { buildDetectWechatAccessIssueJs, buildWechatArticleSnapshotJs, detectWechatAccessIssue, waitForWechatArticle } from './download.js';

const articleUrl = 'https://mp.weixin.qq.com/s/example';
const challengeUrl = 'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?target_url=example';
const article = '<h1 id="activity-name">Article title</h1><div id="js_content"><p>Actual article body</p></div>';
const verification = 'environment verification required';
const windows = [];

function mockPage(html = '', url = articleUrl) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    windows.push(dom.window);
    Object.defineProperty(dom.window.document, 'readyState', { value: 'complete', configurable: true });
    Object.defineProperty(dom.window.document.body, 'innerText', { get() { return this.textContent; } });
    return {
        dom,
        page: {
            goto: vi.fn().mockResolvedValue(undefined),
            wait: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn(async script => dom.window.eval(script)),
        },
    };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    for (const window of windows.splice(0)) window.close();
    vi.clearAllTimers();
    vi.useRealTimers();
    mocks.downloadArticle.mockReset();
});

describe('explicit WeChat interaction prompts', () => {
    it.each([
        ['环境异常 完成验证后即可继续访问 去验证', '<a id="js_verify">去验证</a>', false, verification],
        ['安全验证 请拖动物体完成验证', '', false, verification],
        ['环境异常，请拖动物体完成验证', '', false, verification],
        ['', '<iframe src="/secitptpage/verify.html"></iframe>', false, ''],
        ['安全验证 请拖动物体完成验证', '<div id="js_content">Article about verification</div>', true, ''],
    ])('matches the self-contained browser helper', (text, html, hasArticle, expected) => {
        expect(detectWechatAccessIssue(text, html, hasArticle)).toBe(expected);
        const inPage = runInNewContext(buildDetectWechatAccessIssueJs());
        expect(inPage(text, html, hasArticle)).toBe(expected);
    });
});

describe('article readiness on the same page', () => {
    it('waits through a quiet loading shell until title and body arrive', async () => {
        const { page, dom } = mockPage('<div>Loading</div>');
        const done = vi.fn();
        const pending = waitForWechatArticle(page, { timeoutMs: 2000 }).then(done);
        setTimeout(() => { dom.window.document.body.innerHTML = article; }, 1100);
        await vi.advanceTimersByTimeAsync(600);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(700);
        await pending;
        expect(done.mock.calls[0][0]).toMatchObject({ ready: true, title: 'Article title' });
        expect(done.mock.calls[0][0].contentHtml).toContain('Actual article body');
        expect(page.goto).not.toHaveBeenCalled();
        expect(page.wait).not.toHaveBeenCalled();
    });

    it('lets an opaque intermediate page advance naturally to the article', async () => {
        const { page, dom } = mockPage('<iframe></iframe>', challengeUrl);
        setTimeout(() => { dom.reconfigure({ url: articleUrl }); dom.window.document.body.innerHTML = article; }, 800);
        const pending = waitForWechatArticle(page, { timeoutMs: 2000 });
        await vi.advanceTimersByTimeAsync(1000);
        expect(await pending).toMatchObject({ ready: true, errorHint: '' });
        expect(page.goto).not.toHaveBeenCalled();
    });

    it('stops immediately when explicit human interaction is requested', async () => {
        const { page } = mockPage('<div>安全验证</div><div>请拖动物体完成验证</div>', challengeUrl);
        expect(await waitForWechatArticle(page)).toMatchObject({ ready: false, errorHint: verification });
        expect(page.evaluate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('times out an opaque intermediate page without inferring a verification requirement', async () => {
        const { page } = mockPage('<iframe></iframe>', challengeUrl);
        const result = expect(waitForWechatArticle(page, { timeoutMs: 1000 }))
            .rejects.toMatchObject({ code: 'TIMEOUT' });
        await vi.advanceTimersByTimeAsync(1000);
        await result;
        expect(page.evaluate).toHaveBeenCalledTimes(4);
    });

    it.each([
        '',
        '<h1 id="activity-name">Title only</h1><div id="js_content"> <script>not article text</script></div>',
        '<div id="js_content"><p>Body without title</p></div>',
    ])('times out incomplete content without restarting the budget', async html => {
        const { page } = mockPage(html);
        const result = expect(waitForWechatArticle(page, { timeoutMs: 1000 })).rejects.toMatchObject({ code: 'TIMEOUT' });
        await vi.advanceTimersByTimeAsync(1000);
        await result;
        expect(page.evaluate).toHaveBeenCalledTimes(4);
        expect(page.goto).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not accept a late browser response or dispatch another probe after the budget', async () => {
        const page = { evaluate: vi.fn(() => new Promise(resolve => {
            setTimeout(() => resolve({ ready: true }), 1500);
        })) };
        const result = expect(waitForWechatArticle(page, { timeoutMs: 1000 }))
            .rejects.toMatchObject({ code: 'TIMEOUT' });
        await vi.advanceTimersByTimeAsync(1500);
        await result;
        expect(page.evaluate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('propagates browser transport failures without masking them as page loading', async () => {
        const failure = new Error('Extension disconnected');
        const page = { evaluate: vi.fn().mockRejectedValue(failure) };
        await expect(waitForWechatArticle(page)).rejects.toBe(failure);
        expect(page.evaluate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('waits for the document to finish parsing even if content nodes already exist', async () => {
        const { page, dom } = mockPage(article);
        Object.defineProperty(dom.window.document, 'readyState', { value: 'loading', configurable: true });
        const done = vi.fn();
        const pending = waitForWechatArticle(page).then(done);
        await vi.advanceTimersByTimeAsync(500);
        expect(done).not.toHaveBeenCalled();
        Object.defineProperty(dom.window.document, 'readyState', { value: 'interactive', configurable: true });
        await vi.advanceTimersByTimeAsync(250);
        await pending;
        expect(done.mock.calls[0][0].ready).toBe(true);
    });

    it('accepts image-only articles and does not mutate the live content while extracting', async () => {
        const html = '<h1 id="js_text_title">Image article</h1><div id="js_content"><img data-src="https://example.com/image.png"><script>example()</script></div>';
        const { page, dom } = mockPage(html);
        const before = dom.window.document.body.innerHTML;
        const data = await waitForWechatArticle(page);
        expect(data.ready).toBe(true);
        expect(data.imageUrls).toEqual(['https://example.com/image.png']);
        expect(data.contentHtml).not.toContain('<script>');
        expect(dom.window.document.body.innerHTML).toBe(before);
    });

    it('extracts an article discussing verification without treating its links as a challenge', async () => {
        const { page } = mockPage('<h1 id="activity-name">Verification guide</h1><div id="js_content">安全验证 请拖动物体完成验证 <a href="/secitptpage/verify.html">example</a></div>');
        expect(await waitForWechatArticle(page)).toMatchObject({ ready: true, errorHint: '' });
    });
});

describe('download integration', () => {
    it('navigates once, waits for real content, and only then saves the snapshot', async () => {
        const { page, dom } = mockPage('<div>Loading</div>');
        const adapter = mocks.cli.mock.calls[0][0];
        expect(adapter.navigateBefore).toBe(false);
        const input = 'https://mp.weixin.qq.com/s?__biz=example&mid=123&idx=1&sn=abc&scene=21#wechat_redirect';
        mocks.downloadArticle.mockResolvedValue([{ status: 'success' }]);
        const pending = adapter.func(page, { url: input, output: '/unused-test-output' });
        await vi.advanceTimersByTimeAsync(600);
        expect(mocks.downloadArticle).not.toHaveBeenCalled();
        dom.window.document.body.innerHTML = article;
        await vi.advanceTimersByTimeAsync(250);
        expect(await pending).toEqual([{ status: 'success' }]);
        expect(page.goto).toHaveBeenCalledExactlyOnceWith(input);
        expect(mocks.downloadArticle.mock.calls[0][0]).toMatchObject({ title: 'Article title', sourceUrl: input });
    });

    it('does not save or navigate again after an interactive verification prompt', async () => {
        const { page } = mockPage('安全验证 请拖动物体完成验证', challengeUrl);
        const adapter = mocks.cli.mock.calls[0][0];
        const rows = await adapter.func(page, { url: articleUrl, output: '/unused-test-output' });
        expect(rows[0].status).toBe('failed — verification required in WeChat browser page');
        expect(mocks.downloadArticle).not.toHaveBeenCalled();
        expect(page.goto).toHaveBeenCalledExactlyOnceWith(articleUrl);
    });

    it('never downloads when the default readiness deadline expires', async () => {
        const { page } = mockPage('Loading');
        const adapter = mocks.cli.mock.calls[0][0];
        const result = expect(adapter.func(page, { url: articleUrl, output: '/unused-test-output' }))
            .rejects.toMatchObject({ code: 'TIMEOUT' });
        await vi.advanceTimersByTimeAsync(15000);
        await result;
        expect(mocks.downloadArticle).not.toHaveBeenCalled();
        expect(page.goto).toHaveBeenCalledOnce();
    });
});
