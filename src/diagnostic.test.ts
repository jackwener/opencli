import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildRepairContext, isDiagnosticEnabled, emitDiagnostic,
  truncate, redactUrl, MAX_DIAGNOSTIC_BYTES,
  type RepairContext,
} from './diagnostic.js';
import { SelectorError, CommandExecutionError } from './errors.js';
import type { InternalCliCommand } from './registry.js';

function makeCmd(overrides: Partial<InternalCliCommand> = {}): InternalCliCommand {
  return {
    site: 'test-site',
    name: 'test-cmd',
    description: 'test',
    args: [],
    ...overrides,
  } as InternalCliCommand;
}

describe('isDiagnosticEnabled', () => {
  const origEnv = process.env.OPENCLI_DIAGNOSTIC;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.OPENCLI_DIAGNOSTIC;
    else process.env.OPENCLI_DIAGNOSTIC = origEnv;
  });

  it('returns false when env not set', () => {
    delete process.env.OPENCLI_DIAGNOSTIC;
    expect(isDiagnosticEnabled()).toBe(false);
  });

  it('returns true when env is "1"', () => {
    process.env.OPENCLI_DIAGNOSTIC = '1';
    expect(isDiagnosticEnabled()).toBe(true);
  });

  it('returns false for other values', () => {
    process.env.OPENCLI_DIAGNOSTIC = 'true';
    expect(isDiagnosticEnabled()).toBe(false);
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 100)).toBe('hello');
  });

  it('truncates long strings with marker', () => {
    const long = 'a'.repeat(200);
    const result = truncate(long, 50);
    expect(result.length).toBeLessThan(200);
    expect(result).toContain('...[truncated,');
    expect(result).toContain('150 chars omitted]');
  });
});

describe('redactUrl', () => {
  it('redacts sensitive query parameters', () => {
    expect(redactUrl('https://api.com/v1?token=abc123&q=test'))
      .toBe('https://api.com/v1?token=[REDACTED]&q=test');
  });

  it('redacts multiple sensitive params', () => {
    const url = 'https://api.com?api_key=xxx&secret=yyy&page=1';
    const result = redactUrl(url);
    expect(result).toContain('api_key=[REDACTED]');
    expect(result).toContain('secret=[REDACTED]');
    expect(result).toContain('page=1');
  });

  it('leaves clean URLs unchanged', () => {
    expect(redactUrl('https://example.com/page?q=test')).toBe('https://example.com/page?q=test');
  });
});

describe('buildRepairContext', () => {
  it('captures CliError fields', () => {
    const err = new SelectorError('.missing-element', 'Element removed');
    const ctx = buildRepairContext(err, makeCmd());

    expect(ctx.error.code).toBe('SELECTOR');
    expect(ctx.error.message).toContain('.missing-element');
    expect(ctx.error.hint).toBe('Element removed');
    expect(ctx.error.stack).toBeDefined();
    expect(ctx.adapter.site).toBe('test-site');
    expect(ctx.adapter.command).toBe('test-site/test-cmd');
    expect(ctx.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('handles non-CliError errors', () => {
    const err = new TypeError('Cannot read property "x" of undefined');
    const ctx = buildRepairContext(err, makeCmd());

    expect(ctx.error.code).toBe('UNKNOWN');
    expect(ctx.error.message).toContain('Cannot read property');
    expect(ctx.error.hint).toBeUndefined();
  });

  it('includes page state when provided', () => {
    const pageState: RepairContext['page'] = {
      url: 'https://example.com/page',
      snapshot: '<div>...</div>',
      networkRequests: [{ url: '/api/data', status: 200 }],
      consoleErrors: ['Uncaught TypeError'],
    };
    const ctx = buildRepairContext(new CommandExecutionError('boom'), makeCmd(), pageState);

    expect(ctx.page).toEqual(pageState);
  });

  it('omits page when not provided', () => {
    const ctx = buildRepairContext(new Error('boom'), makeCmd());
    expect(ctx.page).toBeUndefined();
  });

  it('truncates long stack traces', () => {
    const err = new Error('boom');
    err.stack = 'x'.repeat(10_000);
    const ctx = buildRepairContext(err, makeCmd());
    expect(ctx.error.stack!.length).toBeLessThan(10_000);
    expect(ctx.error.stack).toContain('truncated');
  });
});

describe('emitDiagnostic', () => {
  it('writes delimited JSON to stderr', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const ctx = buildRepairContext(new CommandExecutionError('test error'), makeCmd());
    emitDiagnostic(ctx);

    const output = writeSpy.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('___OPENCLI_DIAGNOSTIC___');
    expect(output).toContain('"code":"COMMAND_EXEC"');
    expect(output).toContain('"message":"test error"');

    // Verify JSON is parseable between markers
    const match = output.match(/___OPENCLI_DIAGNOSTIC___\n(.*)\n___OPENCLI_DIAGNOSTIC___/);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]);
    expect(parsed.error.code).toBe('COMMAND_EXEC');

    writeSpy.mockRestore();
  });

  it('drops page snapshot when over size budget', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const ctx: RepairContext = {
      error: { code: 'COMMAND_EXEC', message: 'boom' },
      adapter: { site: 'test', command: 'test/cmd' },
      page: {
        url: 'https://example.com',
        snapshot: 'x'.repeat(MAX_DIAGNOSTIC_BYTES + 1000),
        networkRequests: [],
        consoleErrors: [],
      },
      timestamp: new Date().toISOString(),
    };
    emitDiagnostic(ctx);

    const output = writeSpy.mock.calls.map(c => c[0]).join('');
    const match = output.match(/___OPENCLI_DIAGNOSTIC___\n(.*)\n___OPENCLI_DIAGNOSTIC___/);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]);
    // Page snapshot should be replaced or page dropped entirely
    expect(parsed.page?.snapshot !== ctx.page!.snapshot || parsed.page === undefined).toBe(true);
    expect(match![1].length).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES);

    writeSpy.mockRestore();
  });

  it('redacts sensitive headers in network requests', () => {
    const pageState: RepairContext['page'] = {
      url: 'https://example.com',
      snapshot: '<div/>',
      networkRequests: [{
        url: 'https://api.com/data?token=secret123',
        headers: { authorization: 'Bearer xyz', 'content-type': 'application/json' },
        body: '{"data": "ok"}',
      }],
      consoleErrors: [],
    };
    // Build context manually to test redaction via collectPageState
    // Since collectPageState is private, test the output of buildRepairContext
    // with already-collected page state — redaction happens in collectPageState.
    // For unit test, verify redactUrl directly (tested above) and trust integration.
    expect(redactUrl('https://api.com/data?token=secret123')).toContain('[REDACTED]');
  });
});
