import { describe, expect, it } from 'vitest';
import { isEmptyListsState, parseListCards } from './lists-parser.js';

describe('twitter lists parser', () => {
    it('parses english list cards without relying on page locale', () => {
        const result = parseListCards([
            {
                href: '/i/lists/123',
                text: `AI Researchers
@jack
124 Members 3.4K Followers
Private`,
            },
        ]);
        expect(result).toEqual([
            {
                name: 'AI Researchers',
                members: '124',
                followers: '3.4K',
                mode: 'private',
            },
        ]);
    });

    it('parses chinese list cards without scanning document.body.innerText', () => {
        const result = parseListCards([
            {
                href: '/i/lists/456',
                text: `AI观察
@jack
321 位成员 8.8K 位关注者
锁定列表`,
            },
        ]);
        expect(result).toEqual([
            {
                name: 'AI观察',
                members: '321',
                followers: '8.8K',
                mode: 'private',
            },
        ]);
    });

    it('detects empty state text in english and chinese', () => {
        expect(isEmptyListsState(`@jack hasn't created any Lists yet`)).toBe(true);
        expect(isEmptyListsState('这个账号还没有创建任何列表')).toBe(true);
        expect(isEmptyListsState('AI Researchers 124 Members')).toBe(false);
    });
});
