import { describe, expect, it } from 'vitest';
import { __test__ } from './following.js';

describe('twitter following helpers', () => {
    it('falls back when queryId contains unsafe characters', () => {
        expect(__test__.sanitizeQueryId('safe_Query-123', 'fallback')).toBe('safe_Query-123');
        expect(__test__.sanitizeQueryId('bad"id', 'fallback')).toBe('fallback');
        expect(__test__.sanitizeQueryId('bad/id', 'fallback')).toBe('fallback');
        expect(__test__.sanitizeQueryId(null, 'fallback')).toBe('fallback');
    });

    it('builds following url with cursor', () => {
        const url = __test__.buildFollowingUrl('query123', '42', 20, 'cursor-1');
        expect(url).toContain('/i/api/graphql/query123/Following');
        expect(decodeURIComponent(url)).toContain('"userId":"42"');
        expect(decodeURIComponent(url)).toContain('"count":20');
        expect(decodeURIComponent(url)).toContain('"cursor":"cursor-1"');
    });

    it('builds following url without cursor', () => {
        const url = __test__.buildFollowingUrl('query123', '42', 20);
        expect(url).toContain('/i/api/graphql/query123/Following');
        expect(decodeURIComponent(url)).not.toContain('"cursor"');
    });

    it('extracts user from result', () => {
        const user = __test__.extractUser({
            __typename: 'User',
            core: { screen_name: 'alice', name: 'Alice' },
            legacy: { description: 'bio text', followers_count: 100 },
        });
        expect(user).toMatchObject({
            screen_name: 'alice',
            name: 'Alice',
            bio: 'bio text',
            followers: 100,
        });
    });

    it('returns null for non-User typename', () => {
        expect(__test__.extractUser({ __typename: 'Tweet' })).toBeNull();
        expect(__test__.extractUser(null)).toBeNull();
        expect(__test__.extractUser(undefined)).toBeNull();
    });

    it('falls back to legacy screen_name if core is missing', () => {
        const user = __test__.extractUser({
            __typename: 'User',
            legacy: { screen_name: 'bob', name: 'Bob', description: '', followers_count: 0 },
        });
        expect(user?.screen_name).toBe('bob');
    });

    it('parses following timeline with users and cursor', () => {
        const payload = {
            data: {
                user: {
                    result: {
                        timeline_v2: {
                            timeline: {
                                instructions: [{
                                    entries: [
                                        {
                                            entryId: 'user-1',
                                            content: {
                                                itemContent: {
                                                    user_results: {
                                                        result: {
                                                            __typename: 'User',
                                                            core: { screen_name: 'bob', name: 'Bob' },
                                                            legacy: { description: 'hello', followers_count: 50 },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                        {
                                            entryId: 'user-2',
                                            content: {
                                                itemContent: {
                                                    user_results: {
                                                        result: {
                                                            __typename: 'User',
                                                            core: { screen_name: 'carol', name: 'Carol' },
                                                            legacy: { description: 'world', followers_count: 200 },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                        {
                                            entryId: 'cursor-bottom-1',
                                            content: {
                                                entryType: 'TimelineTimelineCursor',
                                                cursorType: 'Bottom',
                                                value: 'next-cursor',
                                            },
                                        },
                                    ],
                                }],
                            },
                        },
                    },
                },
            },
        };
        const result = __test__.parseFollowing(payload);
        expect(result.users).toHaveLength(2);
        expect(result.users[0]).toMatchObject({ screen_name: 'bob', name: 'Bob', followers: 50 });
        expect(result.users[1]).toMatchObject({ screen_name: 'carol', name: 'Carol', followers: 200 });
        expect(result.nextCursor).toBe('next-cursor');
    });

    it('handles cursor-bottom entryId pattern', () => {
        const payload = {
            data: {
                user: {
                    result: {
                        timeline: {
                            timeline: {
                                instructions: [{
                                    entries: [
                                        {
                                            entryId: 'cursor-bottom-0',
                                            content: {
                                                itemContent: { value: 'cursor-val' },
                                            },
                                        },
                                    ],
                                }],
                            },
                        },
                    },
                },
            },
        };
        const result = __test__.parseFollowing(payload);
        expect(result.nextCursor).toBe('cursor-val');
        expect(result.users).toHaveLength(0);
    });

    it('returns empty users and null cursor for missing instructions', () => {
        const result = __test__.parseFollowing({ data: { user: { result: {} } } });
        expect(result.users).toHaveLength(0);
        expect(result.nextCursor).toBeNull();
    });

    it('returns empty for completely empty payload', () => {
        const result = __test__.parseFollowing({});
        expect(result.users).toHaveLength(0);
        expect(result.nextCursor).toBeNull();
    });
});
