import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confirmPrompt } from './tui.js';

describe('confirmPrompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns defaultYes when stdin is not TTY', async () => {
    const result = await confirmPrompt('Restart?', true);
    expect(result).toBe(true);
  });

  it('returns false when defaultYes is false and non-TTY', async () => {
    const result = await confirmPrompt('Restart?', false);
    expect(result).toBe(false);
  });

  it('defaults to true when defaultYes is omitted and non-TTY', async () => {
    const result = await confirmPrompt('Restart?');
    expect(result).toBe(true);
  });
});
