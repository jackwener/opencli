import { describe, it, expect } from 'vitest';
import { extractSchema, diffSchemas, formatReport, type SchemaDiff, type ContractResult } from './schema.js';

describe('extractSchema', () => {
  it('extracts field names, types, and presentRate from rows', () => {
    const rows = [
      { title: 'a', score: 10, url: 'http://x' },
      { title: 'b', score: 20, url: 'http://y' },
      { title: 'c', score: 30, url: '' },
    ];
    const schema = extractSchema(rows, 'test/cmd');
    expect(schema.command).toBe('test/cmd');
    expect(schema.rowCount).toBe(3);
    expect(schema.fields.title).toEqual({ types: ['string'], presentRate: 1.0 });
    expect(schema.fields.score).toEqual({ types: ['number'], presentRate: 1.0 });
    expect(schema.fields.url.presentRate).toBeCloseTo(0.67, 1);
  });

  it('records multiple types when field has mixed values', () => {
    const rows = [
      { val: 42 },
      { val: 'text' },
      { val: true },
    ];
    const schema = extractSchema(rows, 'test/mixed');
    expect(schema.fields.val.types.sort()).toEqual(['boolean', 'number', 'string']);
  });

  it('distinguishes arrays from objects', () => {
    const rows = [
      { tags: ['a', 'b'], meta: { key: 'val' } },
      { tags: ['c'], meta: { key: 'val2' } },
    ];
    const schema = extractSchema(rows, 'test/array-vs-obj');
    expect(schema.fields.tags.types).toEqual(['array']);
    expect(schema.fields.meta.types).toEqual(['object']);
  });

  it('treats null, undefined, and empty string as absent', () => {
    const rows = [
      { a: null },
      { a: undefined },
      { a: '' },
    ];
    const schema = extractSchema(rows, 'test/empty');
    expect(schema.fields.a.presentRate).toBe(0);
    expect(schema.fields.a.types).toEqual([]);
  });

  it('treats 0 and false as present values', () => {
    const rows = [
      { score: 0, active: false },
      { score: 0, active: false },
    ];
    const schema = extractSchema(rows, 'test/falsy');
    expect(schema.fields.score.presentRate).toBe(1.0);
    expect(schema.fields.active.presentRate).toBe(1.0);
  });

  it('skips non-object rows', () => {
    const rows = ['str', 42, { title: 'a' }, { title: 'b' }, { title: 'c' }] as any[];
    const schema = extractSchema(rows, 'test/mixed-rows');
    expect(schema.rowCount).toBe(3);
  });

  it('handles rows with different field sets (sparse data)', () => {
    const rows = [
      { title: 'a', author: 'x' },
      { title: 'b' },
      { title: 'c', author: 'z' },
    ];
    const schema = extractSchema(rows, 'test/sparse');
    expect(schema.fields.title.presentRate).toBe(1.0);
    expect(schema.fields.author.presentRate).toBeCloseTo(0.67, 1);
  });

  it('returns rowCount 0 when all rows are non-objects', () => {
    const rows = ['a', 'b', 'c'] as any[];
    const schema = extractSchema(rows, 'test/all-primitives');
    expect(schema.rowCount).toBe(0);
    expect(Object.keys(schema.fields)).toHaveLength(0);
  });
});

describe('diffSchemas', () => {
  it('returns empty diffs for identical schemas', () => {
    const schema = extractSchema([{ a: 1, b: 'x' }, { a: 2, b: 'y' }], 'test/same');
    const diffs = diffSchemas(schema, schema);
    expect(diffs).toEqual([]);
  });

  it('detects field_added', () => {
    const prev = extractSchema([{ a: 1 }], 'test/prev');
    const curr = extractSchema([{ a: 1, b: 'new' }], 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs).toContainEqual(expect.objectContaining({ type: 'field_added', field: 'b' }));
  });

  it('detects field_removed', () => {
    const prev = extractSchema([{ a: 1, b: 'old' }], 'test/prev');
    const curr = extractSchema([{ a: 1 }], 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs).toContainEqual(expect.objectContaining({ type: 'field_removed', field: 'b' }));
  });

  it('detects type_changed', () => {
    const prev = extractSchema([{ a: 1 }, { a: 2 }, { a: 3 }], 'test/prev');
    const curr = extractSchema([{ a: '1' }, { a: '2' }, { a: '3' }], 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs).toContainEqual(expect.objectContaining({ type: 'type_changed', field: 'a', from: 'number', to: 'string' }));
  });

  it('detects array-to-object type change', () => {
    const prev = extractSchema([{ tags: ['a'] }, { tags: ['b'] }], 'test/prev');
    const curr = extractSchema([{ tags: { key: 'a' } }, { tags: { key: 'b' } }], 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs).toContainEqual(expect.objectContaining({ type: 'type_changed', field: 'tags', from: 'array', to: 'object' }));
  });

  it('detects presence_dropped when both sides have >= 5 rows', () => {
    const prevRows = Array.from({ length: 10 }, () => ({ a: 'val' }));
    const currRows = [
      ...Array.from({ length: 3 }, () => ({ a: 'val' })),
      ...Array.from({ length: 7 }, () => ({ a: '' })),
    ];
    const prev = extractSchema(prevRows, 'test/prev');
    const curr = extractSchema(currRows, 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs).toContainEqual(expect.objectContaining({ type: 'presence_dropped', field: 'a' }));
  });

  it('skips presence_dropped when curr rowCount < 5', () => {
    const prev = extractSchema([{ a: 'x' }, { a: 'y' }, { a: 'z' }], 'test/prev');
    const curr = extractSchema([{ a: '' }, { a: '' }, { a: 'z' }], 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs.filter(d => d.type === 'presence_dropped')).toHaveLength(0);
  });

  it('skips presence_dropped when prev rowCount < 5', () => {
    const prev = extractSchema(Array.from({ length: 3 }, () => ({ a: 'val' })), 'test/prev');
    const curr = extractSchema([
      ...Array.from({ length: 2 }, () => ({ a: 'val' })),
      ...Array.from({ length: 8 }, () => ({ a: '' })),
    ], 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs.filter(d => d.type === 'presence_dropped')).toHaveLength(0);
  });

  it('flags type_changed when type set expands', () => {
    const prev = extractSchema([{ a: 1 }, { a: 2 }], 'test/prev');
    const curr = extractSchema([{ a: 1 }, { a: 'two' }], 'test/curr');
    const diffs = diffSchemas(prev, curr);
    expect(diffs).toContainEqual(expect.objectContaining({ type: 'type_changed', field: 'a' }));
  });

  it('does not flag type_changed when field goes from present to all-empty', () => {
    const prevRows = Array.from({ length: 10 }, () => ({ title: 'x' }));
    const currRows = Array.from({ length: 10 }, () => ({ title: '' }));
    const prev = extractSchema(prevRows, 'test/prev');
    const curr = extractSchema(currRows, 'test/curr');
    const diffs = diffSchemas(prev, curr);
    // Should only report presence_dropped, NOT type_changed
    expect(diffs.filter(d => d.type === 'type_changed')).toHaveLength(0);
    expect(diffs).toContainEqual(expect.objectContaining({ type: 'presence_dropped', field: 'title' }));
  });
});

describe('formatReport', () => {
  it('prints passed commands with checkmark', () => {
    const results: ContractResult[] = [
      { command: 'hackernews/top', status: 'passed', diffs: [] },
    ];
    const output = formatReport(results);
    expect(output).toContain('✓');
    expect(output).toContain('hackernews/top');
    expect(output).toContain('no drift');
  });

  it('prints drifted commands with cross and diff details', () => {
    const results: ContractResult[] = [
      {
        command: 'v2ex/hot',
        status: 'drifted',
        diffs: [{ type: 'field_removed', field: 'author', detail: 'missing from response' }],
      },
    ];
    const output = formatReport(results);
    expect(output).toContain('✗');
    expect(output).toContain('v2ex/hot');
    expect(output).toContain("field 'author'");
  });

  it('prints failed commands with warning symbol', () => {
    const results: ContractResult[] = [
      { command: 'bloomberg/markets', status: 'failed', error: 'timeout' },
    ];
    const output = formatReport(results);
    expect(output).toContain('⚠');
    expect(output).toContain('command failed');
  });

  it('prints summary line with counts', () => {
    const results: ContractResult[] = [
      { command: 'a/b', status: 'passed', diffs: [] },
      { command: 'c/d', status: 'drifted', diffs: [{ type: 'field_removed', field: 'x', detail: '' }] },
      { command: 'e/f', status: 'failed', error: 'err' },
    ];
    const output = formatReport(results);
    expect(output).toContain('1 passed');
    expect(output).toContain('1 drifted');
    expect(output).toContain('1 failed');
  });
});
