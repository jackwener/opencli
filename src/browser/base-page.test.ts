import { describe, expect, it } from 'vitest';
import { CliError } from '../errors.js';
import { BasePage } from './base-page.js';

class TestPage extends BasePage {
  result: unknown;
  args: Record<string, unknown> | undefined;

  async goto(): Promise<void> {}
  async evaluate(): Promise<unknown> { return null; }
  override async evaluateWithArgs(_js: string, args: Record<string, unknown>): Promise<unknown> {
    this.args = args;
    return this.result;
  }
  async getCookies(): Promise<[]> { return []; }
  async screenshot(): Promise<string> { return ''; }
  async tabs(): Promise<unknown[]> { return []; }
  async selectTab(): Promise<void> {}
}

describe('BasePage.fetchJson', () => {
  it('passes a narrow browser-context JSON request and parses the response in Node', async () => {
    const page = new TestPage();
    page.result = {
      ok: true,
      status: 200,
      url: 'https://api.example.com/items',
      contentType: 'application/json',
      text: '{"items":[1]}',
    };

    await expect(page.fetchJson('https://api.example.com/items', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: { q: 'opencli' },
      timeoutMs: 1234,
    })).resolves.toEqual({ items: [1] });

    expect(page.args).toEqual({
      request: {
        url: 'https://api.example.com/items',
        method: 'POST',
        headers: { 'X-Test': '1' },
        body: { q: 'opencli' },
        hasBody: true,
        timeoutMs: 1234,
      },
    });
  });

  it('throws a CliError for non-JSON responses', async () => {
    const page = new TestPage();
    page.result = {
      ok: true,
      status: 200,
      url: 'https://api.example.com/items',
      contentType: 'text/html',
      text: '<html>blocked</html>',
    };

    const err = await page.fetchJson('https://api.example.com/items').catch((error: unknown) => error);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe('FETCH_ERROR');
    expect((err as CliError).message).toContain('Expected JSON');
    expect((err as CliError).hint).toContain('blocked');
  });

  it('throws a CliError for browser fetch transport errors', async () => {
    const page = new TestPage();
    page.result = {
      ok: false,
      status: 0,
      url: 'https://api.example.com/items',
      text: '',
      error: 'The operation was aborted.',
    };

    await expect(page.fetchJson('https://api.example.com/items')).rejects.toMatchObject({
      code: 'FETCH_ERROR',
      message: expect.stringContaining('The operation was aborted.'),
    });
  });
});
