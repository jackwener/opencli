import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './download.js';

describe('htmlToMarkdown', () => {
  it('renders ordered lists with the original list item content', () => {
    const html = '<ol><li>First item</li><li>Second item</li></ol>';

    expect(htmlToMarkdown(html)).toContain('1. First item');
    expect(htmlToMarkdown(html)).toContain('2. Second item');
    expect(htmlToMarkdown(html)).not.toContain('$1');
  });
});
