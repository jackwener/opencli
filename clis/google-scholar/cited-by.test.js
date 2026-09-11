import { describe, expect, it, vi } from 'vitest';
import { ArgumentError, EmptyResultError } from '@jackwener/opencli/errors';
import { getRegistry } from '@jackwener/opencli/registry';
import './cited-by.js';

describe('google-scholar cited-by command', () => {
    const command = getRegistry().get('google-scholar/cited-by');

    it('registers as a public browser command', () => {
        expect(command).toBeDefined();
        expect(command.site).toBe('google-scholar');
        expect(command.strategy).toBe('public');
        expect(command.browser).toBe(true);
    });

    it('rejects non-numeric cluster id', async () => {
        const page = { goto: vi.fn(), wait: vi.fn(), evaluate: vi.fn() };
        await expect(
            command.func(page, { clusterId: 'abc123' })
        ).rejects.toBeInstanceOf(ArgumentError);
        expect(page.goto).not.toHaveBeenCalled();
    });

    it('rejects negative offset', async () => {
        const page = { goto: vi.fn(), wait: vi.fn(), evaluate: vi.fn() };
        await expect(
            command.func(page, { clusterId: '1234567890', offset: -1 })
        ).rejects.toThrow(/non-negative/);
        expect(page.goto).not.toHaveBeenCalled();
    });

    it('throws EmptyResultError when search hit has no Cited by link', async () => {
        const page = {
            goto: vi.fn().mockResolvedValue(undefined),
            wait: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue({ ok: false, reason: 'result 1 has no "Cited by" link (0 citations)' }),
        };
        await expect(
            command.func(page, { query: 'some obscure uncited paper' })
        ).rejects.toBeInstanceOf(EmptyResultError);
    });

    it('resolves cluster id from search then paginates cited-by pages', async () => {
        const calls = [];
        const page = {
            goto: vi.fn(async (url) => { calls.push(url); }),
            wait: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn(async () => {
                // First evaluate: search page → return cluster id
                if (!calls.some(u => u.includes('cites='))) {
                    return { ok: true, clusterId: '10913151576857741432', title: 'DiffMS', citedText: 'Cited by 80' };
                }
                // Subsequent evaluates: cited-by page → return rows
                return {
                    items: [
                        { title: 'Paper A', authors: 'X Y', source: 'Nature', year: '2026', cited: '5', url: 'https://a' },
                        { title: 'Paper B', authors: 'Z W', source: 'Science', year: '2025', cited: '2', url: 'https://b' },
                    ],
                    resultCount: 2,
                    hasNext: false,
                };
            }),
        };
        const rows = await command.func(page, { query: 'DiffMS', limit: 10 });
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ rank: 1, title: 'Paper A', year: '2026' });
        expect(rows[1]).toMatchObject({ rank: 2, title: 'Paper B' });
        // First goto = search, second goto = cited-by page with cluster id
        expect(calls[0]).toMatch(/scholar\?q=/);
        expect(calls[1]).toMatch(/cites=10913151576857741432/);
    });

    it('uses cluster-id directly without a search round-trip', async () => {
        const calls = [];
        const page = {
            goto: vi.fn(async (url) => { calls.push(url); }),
            wait: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue({
                items: [{ title: 'Citing Paper', authors: 'A', source: 'J', year: '2026', cited: '1', url: 'https://x' }],
                resultCount: 1,
                hasNext: false,
            }),
        };
        const rows = await command.func(page, { clusterId: '9999', limit: 10 });
        expect(rows).toHaveLength(1);
        expect(rows[0].rank).toBe(1);
        // No search URL — straight to cited-by page
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatch(/cites=9999/);
    });
});
