import { afterEach, describe, expect, it } from 'vitest';
import { cli, getRegistry } from './registry.js';
import { getCompletions } from './completion.js';

describe('nested completion paths', () => {
  const keys: string[] = [];

  afterEach(() => {
    for (const key of keys.splice(0)) getRegistry().delete(key);
  });

  it('completes nested command groups and keeps flat commands available', () => {
    cli({
      site: 'notebooklm-tree',
      name: 'source/list',
      aliases: ['source-list'],
      description: 'List sources',
    });
    cli({
      site: 'notebooklm-tree',
      name: 'status',
      description: 'Status',
    });

    keys.push('notebooklm-tree/source/list', 'notebooklm-tree/status');

    expect(getCompletions(['notebooklm-tree'], 2)).toEqual(['source', 'source-list', 'status']);
    expect(getCompletions(['notebooklm-tree', 'source'], 3)).toEqual(['list']);
  });
});
