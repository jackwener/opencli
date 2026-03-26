/**
 * Tests for pipeline step: tap
 */

import { describe, it, expect } from 'vitest';
import { stepTap } from './tap.js';
import { ConfigError } from '../../errors.js';

describe('stepTap', () => {
  it('throws ConfigError when page is null', async () => {
    await expect(
      stepTap(null, { store: 'myStore', action: 'fetchData', capture: '/api' }, {}, {}),
    ).rejects.toThrow(ConfigError);
  });

  it('throws parameter error before ConfigError when store is missing and page is null', async () => {
    await expect(
      stepTap(null, { store: '', action: 'fetchData', capture: '/api' }, {}, {}),
    ).rejects.toThrow('tap: store and action are required');
  });
});
