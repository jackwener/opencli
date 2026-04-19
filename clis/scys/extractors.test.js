import { describe, expect, it, vi } from 'vitest';
import { extractScysArticle, extractScysFeed, extractScysOpportunity } from './extractors.js';

function createScysPageMock({
    loginState,
    evaluateResults = [],
    interceptedRequests = [],
    evaluateMock,
} = {}) {
    const queue = [...evaluateResults];
    return {
        goto: vi.fn(async () => {}),
        wait: async () => {},
        evaluate: async (js) => {
            if (js.includes('const text = (document.body?.innerText ||') && js.includes('hasContentSignals')) {
                return loginState ?? {
                    strongLoginText: false,
                    genericLoginText: false,
                    loginByDom: false,
                    hasContentSignals: true,
                    routeLooksLikeLogin: false,
                    loginCtaText: false,
                };
            }
            if (typeof evaluateMock === 'function') {
                return evaluateMock(js, queue);
            }
            return queue.shift();
        },
        autoScroll: async () => {},
        installInterceptor: async () => {},
        getInterceptedRequests: async () => interceptedRequests,
        getCookies: async () => [],
        snapshot: async () => null,
        click: async () => {},
        typeText: async () => {},
        pressKey: async () => {},
        scrollTo: async () => null,
        getFormState: async () => null,
        tabs: async () => [],
        closeTab: async () => {},
        newTab: async () => {},
        selectTab: async () => {},
        networkRequests: async () => [],
        consoleMessages: async () => [],
        scroll: async () => {},
        waitForCapture: async () => {},
        screenshot: async () => '',
        getCurrentUrl: async () => 'https://scys.com/',
    };
}

describe('extractScysFeed', () => {
    it('uses an explicit authenticated essence request instead of relying on stale tab-switch captures', async () => {
        const page = createScysPageMock({
            evaluateMock: (js) => {
                if (js.includes("__user_token.v3") && js.includes("isDigested")) {
                    return {
                        ok: true,
                        status: 200,
                        items: [
                            {
                                detailUrl: null,
                                topicDTO: {
                                    topicId: '22255855424524441',
                                    entityType: 'xq_topic',
                                    showTitle: '昨天直播的分享内容整理出来了，没想到直播了四个半小时，讲了123 万字，还是聊了挺多内容的。',
                                    articleContent: '没来得及看直播的圈友，可以进生财有术视频号。',
                                    gmtCreate: 1_776_145_020,
                                    likeCount: 12,
                                    commentsCount: 3,
                                    favoriteCount: 4,
                                    isDigested: true,
                                    menuList: [{ value: '亦仁' }],
                                },
                                topicUserDTO: {
                                    name: '亦仁',
                                },
                            },
                        ],
                    };
                }
                if (js.includes("window.__opencli_xhr") || js.includes("__opencli_interceptor_patched")) {
                    throw new Error('stale interceptor path should not run when direct essence API succeeds');
                }
                return undefined;
            },
        });

        const rows = await extractScysFeed(page, 'https://scys.com/?filter=essence', {
            waitSeconds: 1,
            limit: 1,
            maxLength: 600,
        });

        expect(rows).toEqual([
            expect.objectContaining({
                topic_id: '22255855424524441',
                entity_type: 'xq_topic',
                url: 'https://scys.com/articleDetail/xq_topic/22255855424524441',
                flags: ['精华'],
                title: '昨天直播的分享内容整理出来了，没想到直播了四个半小时，讲了123 万字，还是聊了挺多内容的。',
            }),
        ]);
    });

    it('keeps SCYS detail identity even when the list item also has an external source link', async () => {
        const page = createScysPageMock({
            evaluateResults: [undefined, undefined],
            interceptedRequests: [
                {
                    data: {
                        items: [
                            {
                                detailUrl: 'https://my.feishu.cn/docx/PSdVdb8j3oIcIExlOsuctM4gnge?from=from_copylink',
                                topicDTO: {
                                    topicId: '82255511485258522',
                                    entityType: 'xq_topic',
                                    externalLink: 'https://my.feishu.cn/docx/PSdVdb8j3oIcIExlOsuctM4gnge?from=from_copylink',
                                    showTitle: '新手怎么用视频号做高客单流量？从0-1踩坑的合规指南',
                                    articleContent: '视频号这篇辛苦大家移步飞书',
                                    gmtCreate: 1_776_145_020,
                                    likeCount: 12,
                                    commentsCount: 3,
                                    favoriteCount: 4,
                                    menuList: [{ value: '视频号' }, { value: '项目实操' }],
                                },
                                topicUserDTO: {
                                    name: '些些怡',
                                },
                            },
                        ],
                    },
                },
            ],
        });

        const rows = await extractScysFeed(page, 'https://scys.com/?filter=essence', {
            waitSeconds: 1,
            limit: 1,
            maxLength: 600,
        });

        expect(rows).toEqual([
            expect.objectContaining({
                topic_id: '82255511485258522',
                entity_type: 'xq_topic',
                url: 'https://scys.com/articleDetail/xq_topic/82255511485258522',
                raw_url: 'https://scys.com/articleDetail/xq_topic/82255511485258522',
                external_links: ['https://my.feishu.cn/docx/PSdVdb8j3oIcIExlOsuctM4gnge?from=from_copylink'],
                source_links: ['https://my.feishu.cn/docx/PSdVdb8j3oIcIExlOsuctM4gnge?from=from_copylink'],
            }),
        ]);
    });
});

describe('extractScysOpportunity', () => {
    it('uses an explicit authenticated opportunity request instead of relying on tab toggles', async () => {
        const page = createScysPageMock({
            evaluateMock: (js) => {
                if (js.includes("__user_token.v3") && js.includes("pageScene") && js.includes('"fxb"')) {
                    return {
                        ok: true,
                        status: 200,
                        items: [
                            {
                                detailUrl: null,
                                topicDTO: {
                                    topicId: '55522122458215244',
                                    entityType: 'xq_topic',
                                    showTitle: '信息差外面卖几千块的GPTPlus技术原理拆解',
                                    articleContent: '本文仅供技术交流。',
                                    externalLink: 'https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink',
                                    gmtCreate: 1_776_145_020,
                                    likeCount: 12,
                                    commentsCount: 3,
                                    favoriteCount: 4,
                                    menuList: [{ value: '信息差' }, { value: 'ChatGPT' }, { value: '项目实操' }],
                                    imageList: ['https://search01.shengcaiyoushu.com/upload/doc/Lfw7drrJKoO7dgx3nVYccY8hnAd/HRVOb2QkCoafpCxX0YIcqKOdnFd'],
                                },
                                topicUserDTO: {
                                    name: '阿霖',
                                },
                            },
                        ],
                    };
                }
                if (js.includes("window.__opencli_xhr") || js.includes("__opencli_interceptor_patched")) {
                    throw new Error('stale interceptor path should not run when direct opportunity API succeeds');
                }
                return undefined;
            },
        });

        const rows = await extractScysOpportunity(page, 'https://scys.com/opportunity', {
            waitSeconds: 1,
            limit: 1,
            tab: '全部',
        });

        expect(rows).toEqual([
            expect.objectContaining({
                topic_id: '55522122458215244',
                entity_type: 'xq_topic',
                url: 'https://scys.com/articleDetail/xq_topic/55522122458215244',
                raw_url: 'https://scys.com/articleDetail/xq_topic/55522122458215244',
                external_links: ['https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink'],
                source_links: ['https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink'],
            }),
        ]);
    });

    it('recovers topic identity from page cache when DOM fallback only sees an external link', async () => {
        const page = createScysPageMock({
            interceptedRequests: [],
            evaluateMock: (js, queue) => {
                if (js.includes("__user_token.v3") && js.includes('"fxb"')) {
                    return { ok: false, status: 401, items: [] };
                }
                if (queue.length > 0) {
                    return queue.shift();
                }
                return undefined;
            },
            evaluateResults: [
                undefined,
                [
                    {
                        author: '阿霖',
                        time: '1小时前',
                        flags: ['信息差'],
                        title: '信息差外面卖几千块的GPTPlus技术原理拆解',
                        content: '移步飞书：https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink',
                        ai_summary: '',
                        tags: ['ChatGPT', '项目实操'],
                        interactions: '点赞1931 评论0 收藏0',
                        link: 'https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink',
                        image_urls: [
                            'https://search01.shengcaiyoushu.com/upload/doc/Lfw7drrJKoO7dgx3nVYccY8hnAd/HRVOb2QkCoafpCxX0YIcqKOdnFd',
                        ],
                    },
                ],
                [
                    {
                        title: '外面卖几千块的GPTPlus技术原理拆解',
                        topic_id: '55522122458215244',
                        entity_type: 'xq_topic',
                        scys_url: 'https://scys.com/articleDetail/xq_topic/55522122458215244',
                        links: ['https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink'],
                    },
                ],
            ],
        });

        const rows = await extractScysOpportunity(page, 'https://scys.com/opportunity', {
            waitSeconds: 1,
            limit: 1,
            tab: '全部',
        });

        expect(rows).toEqual([
            expect.objectContaining({
                topic_id: '55522122458215244',
                entity_type: 'xq_topic',
                url: 'https://scys.com/articleDetail/xq_topic/55522122458215244',
                raw_url: 'https://scys.com/articleDetail/xq_topic/55522122458215244',
                external_links: ['https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink'],
                source_links: ['https://flex-fox.feishu.cn/wiki/BdGkw2dqDiDBPWkkOhvcrJ7tnCe?from=from_copylink'],
            }),
        ]);
    });
});

describe('extractScysArticle', () => {
  it('waits past shell placeholders and returns hydrated article content', async () => {
        const page = createScysPageMock({
            evaluateResults: [
                {
                    entityType: 'xq_topic',
                    topicId: '55522122288425554',
                    title: '生财官网·会员主题贴',
                    author: '',
                    time: '',
                    flags: [],
                    tags: [],
                    content: '',
                    aiSummary: '',
                    likeText: '',
                    commentText: '',
                    favoriteText: '',
                    images: [],
                    sourceLinks: [],
                    externalLinks: [],
                    pageUrl: 'https://scys.com/articleDetail/xq_topic/55522122288425554',
                },
                {
                    entityType: 'xq_topic',
                    topicId: '55522122288425554',
                    title: 'kikivoice.ai 这是一个免费克隆音频的网站',
                    author: '謃銧閃爍',
                    time: '2026-04-15 17:39',
                    flags: ['工具推荐', '风向标'],
                    tags: ['AI'],
                    content: '工具推荐 kikivoice.ai 这是一个免费克隆音频的网站',
                    aiSummary: '工具名称：kikivoice.ai（音频克隆网站）',
                    likeText: '216',
                    commentText: '5',
                    favoriteText: '0',
                    images: [],
                    sourceLinks: ['https://kikivoice.ai'],
                    externalLinks: ['https://kikivoice.ai'],
                    pageUrl: 'https://scys.com/articleDetail/xq_topic/55522122288425554',
                },
                {
                    entityType: 'xq_topic',
                    topicId: '55522122288425554',
                    title: 'kikivoice.ai 这是一个免费克隆音频的网站',
                    author: '謃銧閃爍',
                    time: '2026-04-15 17:39',
                    flags: ['工具推荐', '风向标'],
                    tags: ['AI'],
                    content: '工具推荐 kikivoice.ai 这是一个免费克隆音频的网站',
                    aiSummary: '工具名称：kikivoice.ai（音频克隆网站）',
                    likeText: '216',
                    commentText: '5',
                    favoriteText: '0',
                    images: [],
                    sourceLinks: ['https://kikivoice.ai'],
                    externalLinks: ['https://kikivoice.ai'],
                    pageUrl: 'https://scys.com/articleDetail/xq_topic/55522122288425554',
                },
            ],
        });

        const result = await extractScysArticle(page, 'https://scys.com/articleDetail/xq_topic/55522122288425554', {
            waitSeconds: 1,
            maxLength: 4000,
        });

        expect(result).toMatchObject({
            topic_id: '55522122288425554',
            title: 'kikivoice.ai 这是一个免费克隆音频的网站',
            author: '謃銧閃爍',
            content: '工具推荐 kikivoice.ai 这是一个免费克隆音频的网站',
            external_links: ['https://kikivoice.ai'],
            source_links: ['https://kikivoice.ai'],
        });
    });

    it('re-navigates once when the article stays on shell content and then succeeds', async () => {
        const page = createScysPageMock({
            evaluateResults: [
                {
                    entityType: 'xq_topic',
                    topicId: '14422288551185512',
                    title: '生财官网·会员主题贴',
                    author: '',
                    time: '',
                    flags: [],
                    tags: [],
                    content: '',
                    aiSummary: '',
                    likeText: '',
                    commentText: '',
                    favoriteText: '',
                    images: [],
                    sourceLinks: [],
                    externalLinks: [],
                    pageUrl: 'https://scys.com/articleDetail/xq_topic/14422288551185512',
                },
                {
                    entityType: 'xq_topic',
                    topicId: '14422288551185512',
                    title: '生财官网·会员主题贴',
                    author: '',
                    time: '',
                    flags: [],
                    tags: [],
                    content: '',
                    aiSummary: '',
                    likeText: '',
                    commentText: '',
                    favoriteText: '',
                    images: [],
                    sourceLinks: [],
                    externalLinks: [],
                    pageUrl: 'https://scys.com/articleDetail/xq_topic/14422288551185512',
                },
                {
                    entityType: 'xq_topic',
                    topicId: '14422288551185512',
                    title: '生财官网·会员主题贴',
                    author: '',
                    time: '',
                    flags: [],
                    tags: [],
                    content: '',
                    aiSummary: '',
                    likeText: '',
                    commentText: '',
                    favoriteText: '',
                    images: [],
                    sourceLinks: [],
                    externalLinks: [],
                    pageUrl: 'https://scys.com/articleDetail/xq_topic/14422288551185512',
                },
                {
                    entityType: 'xq_topic',
                    topicId: '14422288551185512',
                    title: 'Youtube复盘：从5个月颗粒无收到3个月开通3个高级YPP，1.7亿播放',
                    author: '加一',
                    time: '2026-04-17 12:34',
                    flags: ['项目实操'],
                    tags: ['YouTube'],
                    content: '这是一次 Youtube 复盘。',
                    aiSummary: '一次关于 YouTube 变现的复盘总结。',
                    likeText: '88',
                    commentText: '12',
                    favoriteText: '6',
                    images: [],
                    sourceLinks: [],
                    externalLinks: [],
                    pageUrl: 'https://scys.com/articleDetail/xq_topic/14422288551185512',
                },
            ],
        });

        const result = await extractScysArticle(page, 'https://scys.com/articleDetail/xq_topic/14422288551185512', {
            waitSeconds: 1,
            maxLength: 4000,
        });

        expect(page.goto).toHaveBeenCalledTimes(3);
        expect(result).toMatchObject({
            topic_id: '14422288551185512',
            title: 'Youtube复盘：从5个月颗粒无收到3个月开通3个高级YPP，1.7亿播放',
            author: '加一',
            content: '这是一次 Youtube 复盘。',
        });
    });
});
