/**
 * E2E tests for output format rendering.
 * Uses hackernews (public, fast) as a stable data source.
 */

import { describe, it, expect } from 'vitest';
import { runCli, parseJsonOutput } from './helpers.js';

const FORMATS = ['json', 'yaml', 'csv', 'md'] as const;

describe('output formats E2E', () => {
  for (const fmt of FORMATS) {
    it(`hackernews top -f ${fmt} produces valid output`, async () => {
      const { stdout, code } = await runCli(['hackernews', 'top', '--limit', '2', '-f', fmt]);
      expect(code).toBe(0);
      expect(stdout.trim().length).toBeGreaterThan(0);

      if (fmt === 'json') {
        const data = parseJsonOutput(stdout);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(2);
      }

      if (fmt === 'yaml') {
        expect(stdout).toContain('title:');
      }

      if (fmt === 'csv') {
        // CSV should have a header row + data rows
        const lines = stdout.trim().split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(2);
      }

      if (fmt === 'md') {
        // Markdown table should have pipe characters
        expect(stdout).toContain('|');
      }
    }, 30_000);
  }

  it('list -f csv produces valid csv', async () => {
    const { stdout, code } = await runCli(['list', '-f', 'csv']);
    expect(code).toBe(0);
    const lines = stdout.trim().split('\n');
    // Header + many data lines
    expect(lines.length).toBeGreaterThan(50);
  });
});
