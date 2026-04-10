#!/usr/bin/env node

/**
 * Prepare or create GitHub issues for successful local autofix repairs.
 *
 * This helper is intentionally package-local instead of a public CLI command:
 * agents call it after a repair succeeds, but normal end users don't need it in
 * the main command surface.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const DEFAULT_UPSTREAM_REPO = process.env.OPENCLI_UPSTREAM_REPO || 'jackwener/OpenCLI';
export const DIAGNOSTIC_MARKER = '___OPENCLI_DIAGNOSTIC___';
export const NON_REPORTABLE_ERROR_CODES = new Set([
  'AUTH_REQUIRED',
  'BROWSER_CONNECT',
  'ARGUMENT',
  'CONFIG',
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');

export function getPackageVersion() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function parseDiagnosticText(input) {
  const markerBlock = new RegExp(`${DIAGNOSTIC_MARKER}\\n([\\s\\S]*?)\\n${DIAGNOSTIC_MARKER}`);
  const match = input.match(markerBlock);
  const jsonText = match ? match[1] : input.trim();
  return JSON.parse(jsonText);
}

export function loadRepairContext(diagnosticPath) {
  return parseDiagnosticText(readFileSync(diagnosticPath, 'utf8'));
}

export function getSkipReason(repairContext) {
  const code = repairContext?.error?.code;
  if (!code) return 'Missing diagnostic error code.';
  if (NON_REPORTABLE_ERROR_CODES.has(code)) {
    return `${code} is an environment or usage issue, not an adapter bug.`;
  }
  return null;
}

function codeFence(text) {
  return ['```text', text.trim() || '(none)', '```'].join('\n');
}

function escapeInlineCode(value) {
  return String(value ?? '').replaceAll('`', '\\`');
}

function buildIssueTitle(repairContext) {
  const command = repairContext?.adapter?.command || 'unknown';
  const code = repairContext?.error?.code || 'UNKNOWN';
  return `[autofix] ${command}: ${code}`;
}

export function buildIssueDraft({
  repairContext,
  summary = 'Autofix repaired the adapter locally and the retry passed.',
  repo = DEFAULT_UPSTREAM_REPO,
  version = getPackageVersion(),
}) {
  const skipReason = getSkipReason(repairContext);
  if (skipReason) {
    return {
      ok: true,
      action: 'skip',
      canCreate: false,
      skipReason,
      repo,
    };
  }

  const sourcePath = repairContext?.adapter?.sourcePath || '(not available)';
  const pageUrl = repairContext?.page?.url;
  const body = [
    '## Summary',
    'OpenCLI autofix repaired this adapter locally, and the retry passed.',
    '',
    '## Adapter',
    `- Site: \`${escapeInlineCode(repairContext.adapter.site)}\``,
    `- Command: \`${escapeInlineCode(repairContext.adapter.command)}\``,
    `- Local override path: \`${escapeInlineCode(sourcePath)}\``,
    `- OpenCLI version: \`${escapeInlineCode(version)}\``,
    ...(pageUrl ? [`- Failing URL: \`${escapeInlineCode(pageUrl)}\``] : []),
    '',
    '## Original failure',
    `- Error code: \`${escapeInlineCode(repairContext.error.code)}\``,
    '',
    codeFence(repairContext.error.message),
    '',
    '## Local fix summary',
    codeFence(summary),
    '',
    '## Diagnostic timestamp',
    `- Captured at: \`${escapeInlineCode(repairContext.timestamp || new Date().toISOString())}\``,
    '',
    '_Issue draft prepared by OpenCLI autofix after a verified local repair._',
    '',
  ].join('\n');

  return {
    ok: true,
    action: 'prepare',
    canCreate: true,
    repo,
    title: buildIssueTitle(repairContext),
    body,
    metadata: {
      site: repairContext.adapter.site,
      command: repairContext.adapter.command,
      errorCode: repairContext.error.code,
      sourcePath,
      version,
    },
  };
}

export function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function createIssueFromDraft(draft, execFile = execFileSync) {
  if (!draft?.title || !draft?.body) {
    throw new Error('Draft is missing title or body.');
  }
  execFile('gh', ['auth', 'status'], { stdio: 'ignore' });

  const tempDir = mkdtempSync(join(tmpdir(), 'opencli-autofix-issue-'));
  const bodyPath = join(tempDir, 'body.md');
  try {
    writeFileSync(bodyPath, draft.body, 'utf8');
    const url = execFile(
      'gh',
      ['issue', 'create', '--repo', draft.repo, '--title', draft.title, '--body-file', bodyPath],
      { encoding: 'utf8' },
    ).trim();
    return {
      ok: true,
      action: 'create',
      repo: draft.repo,
      title: draft.title,
      url,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function requireString(value, flagName) {
  if (!value || typeof value !== 'string') {
    throw new Error(`Missing required ${flagName}`);
  }
  return value;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  if (command !== 'prepare' && command !== 'create') {
    throw new Error('Usage: autofix-issue.js <prepare|create> [options]');
  }

  const parsed = parseArgs({
    args: argv.slice(1),
    options: {
      diagnostic: { type: 'string' },
      draft: { type: 'string' },
      summary: { type: 'string' },
      'summary-file': { type: 'string' },
      repo: { type: 'string', default: DEFAULT_UPSTREAM_REPO },
      output: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  if (command === 'prepare') {
    const diagnosticPath = requireString(parsed.values.diagnostic, '--diagnostic');
    const summaryFile = parsed.values['summary-file'];
    const summary = summaryFile
      ? readFileSync(summaryFile, 'utf8')
      : (parsed.values.summary || 'Autofix repaired the adapter locally and the retry passed.');
    const draft = buildIssueDraft({
      repairContext: loadRepairContext(diagnosticPath),
      summary,
      repo: parsed.values.repo,
    });
    if (parsed.values.output) writeJson(parsed.values.output, draft);
    printJson(draft);
    return;
  }

  const draftPath = requireString(parsed.values.draft, '--draft');
  const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
  if (!draft?.canCreate) {
    throw new Error(`Draft is not creatable: ${draft?.skipReason || 'unknown reason'}`);
  }
  if (parsed.values.repo) draft.repo = parsed.values.repo;
  const result = createIssueFromDraft(draft);
  printJson(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
