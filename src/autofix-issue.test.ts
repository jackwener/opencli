import { describe, expect, it, vi } from 'vitest';
import {
  buildIssueDraft,
  createIssueFromDraft,
  DEFAULT_UPSTREAM_REPO,
  getSkipReason,
  loadRepairContext,
  parseDiagnosticText,
} from '../scripts/autofix-issue.js';
import type { RepairContext } from './diagnostic.js';

function makeContext(overrides: Partial<RepairContext> = {}): RepairContext {
  return {
    error: {
      code: 'SELECTOR',
      message: 'Could not find element: .old-selector',
    },
    adapter: {
      site: 'zhihu',
      command: 'zhihu/hot',
      sourcePath: '/Users/demo/.opencli/clis/zhihu/hot.js',
    },
    page: {
      url: 'https://www.zhihu.com/hot',
      snapshot: '<div />',
      networkRequests: [],
      consoleErrors: [],
    },
    timestamp: '2026-04-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('parseDiagnosticText', () => {
  it('parses raw JSON diagnostic', () => {
    const ctx = makeContext();
    expect(parseDiagnosticText(JSON.stringify(ctx))).toEqual(ctx);
  });

  it('parses marker-delimited diagnostic output', () => {
    const ctx = makeContext();
    const raw = `stderr...\n___OPENCLI_DIAGNOSTIC___\n${JSON.stringify(ctx)}\n___OPENCLI_DIAGNOSTIC___\n`;
    expect(parseDiagnosticText(raw)).toEqual(ctx);
  });
});

describe('loadRepairContext', () => {
  it('loads context from a diagnostic file', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-diag-'));
    const file = path.join(dir, 'diagnostic.json');
    const ctx = makeContext();
    fs.writeFileSync(file, `___OPENCLI_DIAGNOSTIC___\n${JSON.stringify(ctx)}\n___OPENCLI_DIAGNOSTIC___\n`);

    expect(loadRepairContext(file)).toEqual(ctx);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('getSkipReason', () => {
  it('skips environment issues', () => {
    expect(getSkipReason(makeContext({
      error: { code: 'AUTH_REQUIRED', message: 'login required' },
    }))).toContain('AUTH_REQUIRED');
  });

  it('allows repairable adapter issues', () => {
    expect(getSkipReason(makeContext())).toBeNull();
  });
});

describe('buildIssueDraft', () => {
  it('builds a creatable issue draft for verified local fixes', () => {
    const ctx = makeContext();
    const draft = buildIssueDraft({
      repairContext: ctx,
      summary: 'Updated selector from .old-selector to .new-selector; retry passed.',
      version: '1.7.0',
    });

    expect(draft.canCreate).toBe(true);
    expect(draft.repo).toBe(DEFAULT_UPSTREAM_REPO);
    expect(draft.title).toContain('zhihu/hot');
    expect(draft.title).toContain('SELECTOR');
    expect(draft.body).toContain('Updated selector from .old-selector to .new-selector; retry passed.');
    expect(draft.body).toContain('/Users/demo/.opencli/clis/zhihu/hot.js');
    expect(draft.body).toContain('1.7.0');
  });

  it('returns a skip draft for non-reportable failures', () => {
    const draft = buildIssueDraft({
      repairContext: makeContext({
        error: { code: 'BROWSER_CONNECT', message: 'daemon not running' },
      }),
      summary: 'No-op',
      version: '1.7.0',
    });

    expect(draft.canCreate).toBe(false);
    expect(draft.action).toBe('skip');
    expect(draft.skipReason).toContain('BROWSER_CONNECT');
  });
});

describe('createIssueFromDraft', () => {
  it('checks gh auth then creates the issue', () => {
    const draft = buildIssueDraft({
      repairContext: makeContext(),
      summary: 'Retry passed.',
      version: '1.7.0',
    });
    const exec = vi
      .fn()
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => 'https://github.com/jackwener/OpenCLI/issues/999\n');

    const result = createIssueFromDraft(draft, exec);

    expect(exec).toHaveBeenNthCalledWith(1, 'gh', ['auth', 'status'], { stdio: 'ignore' });
    expect(exec.mock.calls[1][0]).toBe('gh');
    expect(exec.mock.calls[1][1]).toContain('issue');
    expect(result.url).toContain('/issues/999');
  });
});
