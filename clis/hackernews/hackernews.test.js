import { describe, expect, it } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './top.js';
import './best.js';
import './ask.js';
import './new.js';
import './show.js';
import './jobs.js';
import './search.js';
import './read.js';

describe('hackernews listing adapters expose item id', () => {
  const storyCommands = ['hackernews/top', 'hackernews/best', 'hackernews/ask', 'hackernews/new', 'hackernews/show'];

  storyCommands.forEach((key) => {
    it(`${key} surfaces id alongside title/score/author/comments/url`, () => {
      const cmd = getRegistry().get(key);
      expect(cmd?.columns).toEqual(['rank', 'id', 'title', 'score', 'author', 'comments', 'url']);
      expect(cmd?.pipeline?.[5]?.map).toMatchObject({
        id: '${{ item.id }}',
        url: '${{ item.url }}',
      });
    });
  });

  it('hackernews/jobs surfaces id alongside title/author/url', () => {
    const cmd = getRegistry().get('hackernews/jobs');
    expect(cmd?.columns).toEqual(['rank', 'id', 'title', 'author', 'url']);
    expect(cmd?.pipeline?.[5]?.map).toMatchObject({
      id: '${{ item.id }}',
      url: '${{ item.url }}',
    });
  });

  it('hackernews/search surfaces id (algolia objectID) alongside the existing columns', () => {
    const cmd = getRegistry().get('hackernews/search');
    expect(cmd?.columns).toEqual(['rank', 'id', 'title', 'score', 'author', 'comments', 'url']);
    expect(cmd?.pipeline?.[2]?.map).toMatchObject({
      id: '${{ item.objectID }}',
    });
  });
});

describe('hackernews/read adapter', () => {
  const cmd = getRegistry().get('hackernews/read');

  it('registers the comment-thread shape (type/author/score/text)', () => {
    expect(cmd?.columns).toEqual(['type', 'author', 'score', 'text']);
  });

  it('takes a positional id plus tunable depth/limit/replies/max-length args', () => {
    const argNames = (cmd?.args || []).map((a) => a.name);
    expect(argNames).toEqual(['id', 'limit', 'depth', 'replies', 'max-length']);
    const idArg = cmd?.args?.find((a) => a.name === 'id');
    expect(idArg?.required).toBe(true);
    expect(idArg?.positional).toBe(true);
  });

  it('uses the public Firebase API (no browser, public strategy)', () => {
    expect(cmd?.browser).toBe(false);
    expect(cmd?.strategy).toBe('public');
  });
});
