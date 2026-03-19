/**
 * Tests for drift.ts: schema drift detection.
 */

import { describe, it, expect } from 'vitest';
import { detectDrift, formatDriftWarning } from './drift.js';

describe('detectDrift', () => {
  it('returns no drift when all fields are populated', () => {
    const rows = [
      { title: 'a', author: 'x' },
      { title: 'b', author: 'y' },
      { title: 'c', author: 'z' },
    ];
    const report = detectDrift(rows, ['title', 'author']);
    expect(report.hasDrift).toBe(false);
    expect(report.fields).toHaveLength(0);
  });

  it('detects single field all-empty', () => {
    const rows = [
      { title: 'a', author: '' },
      { title: 'b', author: '' },
      { title: 'c', author: '' },
    ];
    const report = detectDrift(rows, ['title', 'author']);
    expect(report.hasDrift).toBe(true);
    expect(report.fields).toHaveLength(1);
    expect(report.fields[0].field).toBe('author');
    expect(report.fields[0].emptyRate).toBe(1.0);
    expect(report.fields[0].emptyCount).toBe(3);
    expect(report.fields[0].totalRows).toBe(3);
  });

  it('detects drift at threshold boundary (>= 0.8)', () => {
    // 4 out of 5 = 80%
    const rows = [
      { title: '' },
      { title: '' },
      { title: '' },
      { title: '' },
      { title: 'x' },
    ];
    const report = detectDrift(rows, ['title'], 0.8);
    expect(report.hasDrift).toBe(true);
    expect(report.fields[0].emptyRate).toBe(0.8);
  });

  it('does not detect drift below threshold', () => {
    // 3 out of 5 = 60%, below default 0.8
    const rows = [
      { title: '' },
      { title: '' },
      { title: '' },
      { title: 'x' },
      { title: 'y' },
    ];
    const report = detectDrift(rows, ['title']);
    expect(report.hasDrift).toBe(false);
  });

  it('detects multiple fields drifting', () => {
    const rows = [
      { title: '', author: '', score: 10 },
      { title: '', author: '', score: 20 },
      { title: '', author: '', score: 30 },
    ];
    const report = detectDrift(rows, ['title', 'author', 'score']);
    expect(report.hasDrift).toBe(true);
    expect(report.fields).toHaveLength(2);
    const fieldNames = report.fields.map(f => f.field);
    expect(fieldNames).toContain('title');
    expect(fieldNames).toContain('author');
  });

  it('returns no drift for empty columns array', () => {
    const rows = [{ title: '' }, { title: '' }, { title: '' }];
    const report = detectDrift(rows, []);
    expect(report.hasDrift).toBe(false);
    expect(report.fields).toHaveLength(0);
  });

  it('detects columns not present in rows as 100% empty', () => {
    const rows = [
      { title: 'a' },
      { title: 'b' },
      { title: 'c' },
    ];
    const report = detectDrift(rows, ['title', 'missing_field']);
    expect(report.hasDrift).toBe(true);
    expect(report.fields[0].field).toBe('missing_field');
    expect(report.fields[0].emptyRate).toBe(1.0);
  });

  it('treats null, undefined, and empty string as empty', () => {
    const rows = [
      { a: null },
      { a: undefined },
      { a: '' },
    ];
    const report = detectDrift(rows, ['a']);
    expect(report.hasDrift).toBe(true);
    expect(report.fields[0].emptyCount).toBe(3);
  });

  it('treats 0 and false as non-empty values', () => {
    const rows = [
      { score: 0, active: false },
      { score: 0, active: false },
      { score: 0, active: false },
    ];
    const report = detectDrift(rows, ['score', 'active']);
    expect(report.hasDrift).toBe(false);
  });

  it('skips non-object rows (primitives)', () => {
    const rows = [
      'string-row',
      42,
      { title: 'a', author: '' },
      { title: 'b', author: '' },
      { title: 'c', author: '' },
    ] as any[];
    const report = detectDrift(rows, ['title', 'author']);
    expect(report.hasDrift).toBe(true);
    // totalRows should be 3 (only object rows counted)
    expect(report.fields[0].totalRows).toBe(3);
  });

  it('returns no drift when valid object rows < 3', () => {
    const rows = [
      'primitive',
      'primitive',
      'primitive',
      { title: '', author: '' },
      { title: '', author: '' },
    ] as any[];
    const report = detectDrift(rows, ['title', 'author']);
    // Only 2 valid object rows, below minimum of 3
    expect(report.hasDrift).toBe(false);
  });
});

describe('formatDriftWarning', () => {
  it('formats warning with field names, counts, and percentages', () => {
    const report = {
      hasDrift: true,
      fields: [
        { field: 'author', emptyCount: 10, totalRows: 10, emptyRate: 1.0 },
        { field: 'title', emptyCount: 8, totalRows: 10, emptyRate: 0.8 },
      ],
    };
    const output = formatDriftWarning(report, 'bilibili/hot');
    // Strip ANSI codes for assertion
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Schema drift detected (bilibili/hot)');
    expect(plain).toContain("field 'author'");
    expect(plain).toContain('10/10 rows (100%)');
    expect(plain).toContain("field 'title'");
    expect(plain).toContain('8/10 rows (80%)');
  });

  it('does not include trailing newline', () => {
    const report = {
      hasDrift: true,
      fields: [{ field: 'x', emptyCount: 3, totalRows: 3, emptyRate: 1.0 }],
    };
    const output = formatDriftWarning(report, 'test/cmd');
    expect(output.endsWith('\n')).toBe(false);
  });
});
