import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import './hot.js';
import './search.js';
import './unanswered.js';
import './bounties.js';
import './read.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('stackoverflow listing adapters surface question_id/tags/views/owner', () => {
    it('stackoverflow/hot has the agent-native column shape', () => {
        const cmd = getRegistry().get('stackoverflow/hot');
        expect(cmd?.columns).toEqual([
            'rank', 'id', 'title', 'score', 'answers', 'views',
            'is_answered', 'tags', 'author', 'creation_date', 'url',
        ]);
        const mapStep = cmd?.pipeline?.find((step) => step.map);
        expect(mapStep?.map).toMatchObject({
            id: '${{ item.question_id }}',
            views: '${{ item.view_count }}',
            is_answered: '${{ item.is_answered }}',
            author: '${{ item.owner.display_name }}',
            creation_date: '${{ item.creation_date }}',
        });
    });

    it('stackoverflow/search has the agent-native column shape', () => {
        const cmd = getRegistry().get('stackoverflow/search');
        expect(cmd?.columns).toEqual([
            'rank', 'id', 'title', 'score', 'answers', 'views',
            'is_answered', 'tags', 'author', 'creation_date', 'url',
        ]);
        const mapStep = cmd?.pipeline?.find((step) => step.map);
        expect(mapStep?.map).toMatchObject({
            id: '${{ item.question_id }}',
            views: '${{ item.view_count }}',
        });
    });

    it('stackoverflow/unanswered drops is_answered (always false) but keeps the rest', () => {
        const cmd = getRegistry().get('stackoverflow/unanswered');
        expect(cmd?.columns).toEqual([
            'rank', 'id', 'title', 'score', 'answers', 'views',
            'tags', 'author', 'creation_date', 'url',
        ]);
        expect(cmd?.columns).not.toContain('is_answered');
    });

    it('stackoverflow/bounties keeps the bounty column at the front', () => {
        const cmd = getRegistry().get('stackoverflow/bounties');
        expect(cmd?.columns).toEqual([
            'rank', 'id', 'bounty', 'title', 'score', 'answers', 'views',
            'is_answered', 'tags', 'author', 'creation_date', 'url',
        ]);
        const mapStep = cmd?.pipeline?.find((step) => step.map);
        expect(mapStep?.map).toMatchObject({
            id: '${{ item.question_id }}',
            bounty: '${{ item.bounty_amount }}',
        });
    });
});

describe('stackoverflow/read adapter', () => {
    const cmd = getRegistry().get('stackoverflow/read');

    it('registers the question/answer/comment row shape', () => {
        expect(cmd?.columns).toEqual(['type', 'author', 'score', 'accepted', 'text']);
    });

    it('takes a positional id plus tunable answers-limit/comments-limit/max-length', () => {
        const argNames = (cmd?.args || []).map((a) => a.name);
        expect(argNames).toEqual(['id', 'answers-limit', 'comments-limit', 'max-length']);
        const idArg = cmd?.args?.find((a) => a.name === 'id');
        expect(idArg?.required).toBe(true);
        expect(idArg?.positional).toBe(true);
    });

    it('uses the public Stack Exchange API (no browser, public strategy)', () => {
        expect(cmd?.browser).toBe(false);
        expect(cmd?.strategy).toBe('public');
    });

    it('fails fast with ArgumentError for non-numeric id before fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(cmd.func({ id: 'not-a-number', 'answers-limit': 10, 'comments-limit': 5, 'max-length': 4000 }))
            .rejects.toThrow(ArgumentError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails fast with ArgumentError for max-length below 100 before fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(cmd.func({ id: '12345', 'answers-limit': 10, 'comments-limit': 5, 'max-length': 50 }))
            .rejects.toThrow(ArgumentError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails fast with EmptyResultError when the question lookup returns empty items', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ items: [] }), { status: 200 }),
        ));

        await expect(cmd.func({ id: '99999999', 'answers-limit': 10, 'comments-limit': 5, 'max-length': 4000 }))
            .rejects.toThrow(EmptyResultError);
    });

    it('surfaces Stack Exchange API throttle / quota errors as CommandExecutionError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error_id: 502, error_name: 'throttle_violation', error_message: 'too fast' }), { status: 200 }),
        ));

        await expect(cmd.func({ id: '12345', 'answers-limit': 10, 'comments-limit': 5, 'max-length': 4000 }))
            .rejects.toThrow(CommandExecutionError);
    });

    it('builds POST + Q-COMMENT + ANSWER + A-COMMENT rows, accepted answer first', async () => {
        const question = {
            items: [{
                question_id: 1,
                title: 'Why?',
                body: '<p>Question body</p>',
                score: 10,
                link: 'https://example.com/q/1',
                owner: { display_name: 'asker' },
            }],
        };
        const qComments = {
            items: [
                { score: 2, owner: { display_name: 'qc1' }, body: '<p>q comment one</p>' },
                { score: 1, owner: { display_name: 'qc2' }, body: '<p>q comment two</p>' },
            ],
        };
        const answers = {
            items: [
                { answer_id: 100, score: 5, is_accepted: false, owner: { display_name: 'low' }, body: '<p>low score answer</p>' },
                { answer_id: 200, score: 50, is_accepted: true, owner: { display_name: 'winner' }, body: '<p>accepted answer</p>' },
            ],
        };
        const answerComments = {
            items: [
                { post_id: 200, score: 1, owner: { display_name: 'ac1' }, body: '<p>comment on accepted</p>' },
                { post_id: 100, score: 0, owner: { display_name: 'ac2' }, body: '<p>comment on low</p>' },
            ],
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(question), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(qComments), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(answers), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(answerComments), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const rows = await cmd.func({ id: '1', 'answers-limit': 10, 'comments-limit': 5, 'max-length': 4000 });

        expect(rows.map((r) => [r.type, r.author, r.accepted])).toEqual([
            ['POST', 'asker', ''],
            ['Q-COMMENT', 'qc1', ''],
            ['Q-COMMENT', 'qc2', ''],
            ['ANSWER', 'winner', 'true'],   // accepted comes FIRST
            ['A-COMMENT', 'ac1', ''],
            ['ANSWER', 'low', ''],
            ['A-COMMENT', 'ac2', ''],
        ]);

        // Verify the answer-comments fetch batched both answer ids
        const ansCommentsCall = fetchMock.mock.calls[3][0];
        expect(ansCommentsCall).toContain('/answers/200;100/comments');
    });

    it('decodes HTML entities in body and display_name (named, decimal, hex)', async () => {
        const question = {
            items: [{
                question_id: 1,
                title: 't',
                body: '<p>price &lt; &amp; &hellip; &#246; &#x27;ok&#x27;</p>',
                score: 0,
                link: '',
                owner: { display_name: 'Jonas K&#246;lker' },
            }],
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(question), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const rows = await cmd.func({ id: '1', 'answers-limit': 10, 'comments-limit': 5, 'max-length': 4000 });

        expect(rows[0].author).toBe('Jonas Kölker');
        expect(rows[0].text).toContain('price < & … ö \'ok\'');
    });

    it('respects answers-limit when there are more answers than the cap', async () => {
        const question = {
            items: [{
                question_id: 1, title: 't', body: '', score: 0, link: '',
                owner: { display_name: 'a' },
            }],
        };
        const answers = {
            items: [
                { answer_id: 100, score: 5, is_accepted: false, owner: { display_name: 'a1' }, body: '' },
                { answer_id: 200, score: 4, is_accepted: false, owner: { display_name: 'a2' }, body: '' },
                { answer_id: 300, score: 3, is_accepted: false, owner: { display_name: 'a3' }, body: '' },
            ],
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(question), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(answers), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const rows = await cmd.func({ id: '1', 'answers-limit': 2, 'comments-limit': 5, 'max-length': 4000 });

        const answerRows = rows.filter((r) => r.type === 'ANSWER');
        expect(answerRows.map((r) => r.author)).toEqual(['a1', 'a2']);
    });
});
