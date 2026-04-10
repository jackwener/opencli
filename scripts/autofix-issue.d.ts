import type { RepairContext } from '../src/diagnostic.js';

export const DEFAULT_UPSTREAM_REPO: string;
export const DIAGNOSTIC_MARKER: string;
export const NON_REPORTABLE_ERROR_CODES: Set<string>;

export interface IssueDraft {
  ok: true;
  action: 'prepare' | 'skip';
  canCreate: boolean;
  repo: string;
  title?: string;
  body?: string;
  skipReason?: string;
  metadata?: {
    site: string;
    command: string;
    errorCode: string;
    sourcePath: string;
    version: string;
  };
}

export interface IssueCreateResult {
  ok: true;
  action: 'create';
  repo: string;
  title: string;
  url: string;
}

export function getPackageVersion(): string;
export function parseDiagnosticText(input: string): RepairContext;
export function loadRepairContext(diagnosticPath: string): RepairContext;
export function getSkipReason(repairContext: RepairContext): string | null;
export function buildIssueDraft(input: {
  repairContext: RepairContext;
  summary?: string;
  repo?: string;
  version?: string;
}): IssueDraft;
export function writeJson(filePath: string, value: unknown): void;
export function createIssueFromDraft(
  draft: {
    repo: string;
    title?: string;
    body?: string;
    canCreate?: boolean;
    skipReason?: string;
  },
  execFile?: (...args: any[]) => any
): IssueCreateResult;
export function main(argv?: string[]): void;
