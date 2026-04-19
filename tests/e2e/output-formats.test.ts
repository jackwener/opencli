/**
 * E2E tests for output format rendering.
 * Uses the built-in list command so renderer coverage does not depend on
 * external network availability.
 */

import { describe, it, expect } from 'vitest';
import { runCli, parseJsonOutput } from './helpers.js';

const FORMATS = ['json', 'yaml'] as const;

describe('output formats E2E', () => {
  for (const fmt of FORMATS) {
    it(`list -f ${fmt} produces valid output`, async () => {
      const { stdout, code } = await runCli(['list', '-f', fmt]);
      expect(code).toBe(0);
      expect(stdout.trim().length).toBeGreaterThan(0);

      if (fmt === 'json') {
        const data = parseJsonOutput(stdout);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(50);
        expect(data[0]).toHaveProperty('command');
        expect(data[0]).toHaveProperty('site');
      }

      if (fmt === 'yaml') {
        expect(stdout).toContain('command:');
        expect(stdout).toContain('site:');
      }
    }, 30_000);
  }
});
