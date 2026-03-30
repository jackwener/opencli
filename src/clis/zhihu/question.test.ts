import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '../../registry.js';
import './question.js';

describe('zhihu question', () => {
  it('returns answers even when the unused question detail request fails', async () => {
    const cmd = getRegistry().get('zhihu/question');
    expect(cmd?.func).toBeTypeOf('function');

    const evaluate = vi.fn().mockImplementation(async (js: string) => {
      if (js.includes('/api/v4/questions/2021881398772981878?include=')) {
        return { error: true };
      }

      return {
        answers: [
          {
            author: { name: 'alice' },
            voteup_count: 12,
            content: '<p>Hello <b>Zhihu</b></p>',
          },
        ],
      };
    });

    const page = {
      evaluate,
    } as any;

    await expect(
      cmd!.func!(page, { id: '2021881398772981878', limit: 3 }),
    ).resolves.toEqual([
      {
        rank: 1,
        author: 'alice',
        votes: 12,
        content: 'Hello Zhihu',
      },
    ]);
  });
});
