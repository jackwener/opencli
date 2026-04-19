import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyResultError } from '@jackwener/opencli/errors';

const { mockExtractScysArticle } = vi.hoisted(() => ({
    mockExtractScysArticle: vi.fn(),
}));

vi.mock('./extractors.js', () => ({
    extractScysArticle: mockExtractScysArticle,
}));

import { getRegistry } from '@jackwener/opencli/registry';
import './article.js';

describe('scys article command retry', () => {
    const command = getRegistry().get('scys/article');
    const page = {
        closeWindow: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        mockExtractScysArticle.mockReset();
        page.closeWindow.mockClear();
    });

    it('retries once after shell-only EmptyResultError', async () => {
        mockExtractScysArticle
            .mockRejectedValueOnce(new EmptyResultError('scys/article', 'Article detail page did not hydrate beyond shell content'))
            .mockResolvedValueOnce({ topic_id: '14422288551185512', title: 'ok' });

        const result = await command.func(page, {
            url: 'https://scys.com/articleDetail/xq_topic/14422288551185512',
            wait: 6,
            'max-length': 4000,
        });

        expect(result).toEqual({ topic_id: '14422288551185512', title: 'ok' });
        expect(mockExtractScysArticle).toHaveBeenCalledTimes(2);
        expect(page.closeWindow).toHaveBeenCalledTimes(1);
    });

    it('retries up to three attempts for retryable shell-only errors', async () => {
        mockExtractScysArticle
            .mockRejectedValueOnce(new EmptyResultError('scys/article', 'Article detail page did not hydrate beyond shell content'))
            .mockRejectedValueOnce(new EmptyResultError('scys/article', 'Article detail page did not hydrate beyond shell content'))
            .mockResolvedValueOnce({ topic_id: '14422288551185512', title: 'ok' });

        const result = await command.func(page, {
            url: 'https://scys.com/articleDetail/xq_topic/14422288551185512',
            wait: 6,
            'max-length': 4000,
        });

        expect(result).toEqual({ topic_id: '14422288551185512', title: 'ok' });
        expect(mockExtractScysArticle).toHaveBeenCalledTimes(3);
        expect(page.closeWindow).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-retryable errors', async () => {
        mockExtractScysArticle.mockRejectedValueOnce(new Error('boom'));

        await expect(command.func(page, {
            url: 'https://scys.com/articleDetail/xq_topic/14422288551185512',
            wait: 6,
            'max-length': 4000,
        })).rejects.toThrow('boom');

        expect(mockExtractScysArticle).toHaveBeenCalledTimes(1);
        expect(page.closeWindow).not.toHaveBeenCalled();
    });
});
