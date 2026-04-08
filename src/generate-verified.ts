/**
 * Verified adapter generation:
 * discover → synthesize → candidate-bound probe → single-session verify.
 *
 * v1 keeps the contract narrow on purpose:
 *   - PUBLIC + COOKIE only
 *   - read-only JSON API surfaces
 *   - single best candidate only
 *   - bounded repair: select/itemPath replacement once
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { exploreUrl } from './explore.js';
import { loadExploreBundle, synthesizeFromExplore, type CandidateYaml, type SynthesizeCandidateSummary } from './synthesize.js';
import { normalizeGoal, selectCandidate } from './generate.js';
import { browserSession, type IBrowserFactory } from './runtime.js';
import { executePipeline } from './pipeline/index.js';
import { registerCommand, Strategy, type CliCommand } from './registry.js';
import {
  AuthRequiredError,
  BrowserConnectError,
  CommandExecutionError,
  TimeoutError,
  getErrorMessage,
} from './errors.js';
import { USER_CLIS_DIR } from './discovery.js';
import type { IPage } from './types.js';

type SupportedStrategy = Strategy.PUBLIC | Strategy.COOKIE;
type VerifyFailureReason = 'empty-result' | 'sparse-fields' | 'non-array-result';

export type BlockReason =
  | 'no-api-discovered'
  | 'auth-required'
  | 'no-viable-candidate'
  | 'browser-unavailable';

export interface GenerateStats {
  endpoint_count: number;
  api_endpoint_count: number;
  candidate_count: number;
  verified: boolean;
  repair_attempted: boolean;
  explore_dir: string;
}

export interface VerifiedAdapter {
  site: string;
  name: string;
  command: string;
  strategy: SupportedStrategy;
  path: string;
}

export interface CandidateInfo {
  site: string;
  name: string;
  command: string;
  strategy: string;
  path: string;
}

export type GenerateOutcome = {
  version: 1;
  status: 'success' | 'blocked' | 'needs-human-check';
  adapter?: VerifiedAdapter;
  reason?: BlockReason;
  candidate?: CandidateInfo;
  issue?: string;
  stats: GenerateStats;
};

export interface GenerateVerifiedOptions {
  url: string;
  BrowserFactory: new () => IBrowserFactory;
  goal?: string | null;
  site?: string;
  waitSeconds?: number;
  top?: number;
  workspace?: string;
  noRegister?: boolean;
}

interface ExploreBundleLike {
  manifest: {
    site: string;
    target_url: string;
    final_url?: string;
  };
  endpoints: Array<{
    pattern: string;
    url: string;
    itemPath: string | null;
    itemCount: number;
    detectedFields: Record<string, string>;
  }>;
  capabilities: Array<{
    name: string;
    strategy: string;
    endpoint?: string;
    itemPath?: string | null;
  }>;
}

interface CandidateContext {
  capability: ExploreBundleLike['capabilities'][number] | undefined;
  endpoint: ExploreBundleLike['endpoints'][number] | null;
}

type VerificationResult =
  | { ok: true }
  | { ok: false; reason: VerifyFailureReason }
  | { ok: false; terminal: 'blocked' | 'needs-human-check'; reason?: BlockReason; issue: string };

function parseSupportedStrategy(value: unknown): SupportedStrategy | null {
  return value === Strategy.PUBLIC || value === Strategy.COOKIE ? value : null;
}

function commandName(site: string, name: string): string {
  return `${site}/${name}`;
}

function buildStats(args: {
  endpointCount: number;
  apiEndpointCount: number;
  candidateCount: number;
  verified?: boolean;
  repairAttempted?: boolean;
  exploreDir: string;
}): GenerateStats {
  return {
    endpoint_count: args.endpointCount,
    api_endpoint_count: args.apiEndpointCount,
    candidate_count: args.candidateCount,
    verified: args.verified ?? false,
    repair_attempted: args.repairAttempted ?? false,
    explore_dir: args.exploreDir,
  };
}

function buildCandidateInfo(site: string, summary: SynthesizeCandidateSummary): CandidateInfo {
  return {
    site,
    name: summary.name,
    command: commandName(site, summary.name),
    strategy: summary.strategy,
    path: summary.path,
  };
}

function readCandidateYaml(filePath: string): CandidateYaml {
  const loaded = yaml.load(fs.readFileSync(filePath, 'utf-8')) as CandidateYaml | null;
  if (!loaded || typeof loaded !== 'object') {
    throw new CommandExecutionError(`Generated candidate is invalid: ${filePath}`);
  }
  return loaded;
}

function chooseEndpoint(
  capability: ExploreBundleLike['capabilities'][number] | undefined,
  endpoints: ExploreBundleLike['endpoints'],
): ExploreBundleLike['endpoints'][number] | null {
  if (!endpoints.length) return null;

  if (capability?.endpoint) {
    const endpointPattern = capability.endpoint;
    const exact = endpoints.find((endpoint) => endpoint.pattern === endpointPattern || endpoint.url.includes(endpointPattern));
    if (exact) return exact;
  }

  return [...endpoints].sort((a, b) => {
    const aScore = (a.itemCount ?? 0) * 10 + Object.keys(a.detectedFields ?? {}).length;
    const bScore = (b.itemCount ?? 0) * 10 + Object.keys(b.detectedFields ?? {}).length;
    return bScore - aScore;
  })[0] ?? null;
}

function cloneCandidate(candidate: CandidateYaml): CandidateYaml {
  return JSON.parse(JSON.stringify(candidate)) as CandidateYaml;
}

function hasBrowserOnlyStep(pipeline: Record<string, unknown>[]): boolean {
  return pipeline.some((step) => {
    const op = Object.keys(step)[0];
    return op === 'navigate' || op === 'wait' || op === 'evaluate' || op === 'click' || op === 'tap' || op === 'type' || op === 'press';
  });
}

function detectBrowserFlag(candidate: CandidateYaml): boolean {
  return candidate.browser ?? hasBrowserOnlyStep(candidate.pipeline as Record<string, unknown>[]);
}

function candidateToCommand(candidate: CandidateYaml, source: string): CliCommand {
  return {
    site: candidate.site,
    name: candidate.name,
    description: candidate.description,
    domain: candidate.domain,
    strategy: parseSupportedStrategy(candidate.strategy) ?? Strategy.COOKIE,
    browser: detectBrowserFlag(candidate),
    args: Object.entries(candidate.args ?? {}).map(([name, def]) => ({
      name,
      type: def.type,
      required: def.required,
      default: def.default,
      help: def.description,
    })),
    columns: candidate.columns,
    pipeline: candidate.pipeline as Record<string, unknown>[],
    source,
  };
}

function buildDefaultArgs(candidate: CandidateYaml): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(candidate.args ?? {})) {
    if (def.default !== undefined) {
      args[name] = def.default;
      continue;
    }

    if (def.type === 'int' || def.type === 'number') {
      args[name] = name === 'page' ? 1 : 20;
      continue;
    }

    if (def.type === 'boolean' || def.type === 'bool') {
      args[name] = false;
      continue;
    }

    if (name === 'keyword' || name === 'query') {
      args[name] = 'test';
      continue;
    }

    if (def.required) args[name] = 'test';
  }
  return args;
}

function getUnsupportedVerificationArgs(candidate: CandidateYaml): string[] {
  return Object.entries(candidate.args ?? {})
    .filter(([name, def]) => {
      if (!def.required || def.default !== undefined) return false;
      if (def.type === 'int' || def.type === 'number') return false;
      if (def.type === 'boolean' || def.type === 'bool') return false;
      if (name === 'keyword' || name === 'query') return false;
      return true;
    })
    .map(([name]) => name);
}

function assessResult(result: unknown, expectedFields: string[] = []): VerificationResult {
  if (!Array.isArray(result)) return { ok: false, reason: 'non-array-result' };
  if (result.length === 0) return { ok: false, reason: 'empty-result' };

  const sample = result[0];
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    return { ok: false, reason: 'sparse-fields' };
  }

  const record = sample as Record<string, unknown>;
  const keys = Object.keys(record);
  const populated = keys.filter((key) => record[key] !== null && record[key] !== undefined && record[key] !== '');
  if (populated.length < 2) return { ok: false, reason: 'sparse-fields' };

  if (expectedFields.length > 0) {
    const matched = expectedFields.filter((field) => keys.includes(field));
    if (matched.length === 0) return { ok: false, reason: 'sparse-fields' };
  }

  return { ok: true };
}

function withItemPath(candidate: CandidateYaml, itemPath: string | null): CandidateYaml | null {
  if (!itemPath) return null;

  const next = cloneCandidate(candidate);
  const selectIndex = next.pipeline.findIndex((step) => 'select' in step);
  if (selectIndex === -1) return null;

  const current = next.pipeline[selectIndex] as { select: string };
  if (current.select === itemPath) return null;
  next.pipeline[selectIndex] = { select: itemPath };
  return next;
}

function applyStrategy(candidate: CandidateYaml, strategy: SupportedStrategy): CandidateYaml {
  const next = cloneCandidate(candidate);
  next.strategy = strategy;
  if (strategy === Strategy.COOKIE) next.browser = true;
  return next;
}

async function verifyCandidate(
  page: IPage,
  candidate: CandidateYaml,
  expectedFields: string[],
): Promise<VerificationResult> {
  try {
    const result = await executePipeline(page, candidate.pipeline as unknown[], {
      args: buildDefaultArgs(candidate),
    });
    return assessResult(result, expectedFields);
  } catch (error) {
    if (error instanceof BrowserConnectError) {
      return { ok: false, terminal: 'blocked', reason: 'browser-unavailable', issue: getErrorMessage(error) };
    }
    if (error instanceof AuthRequiredError) {
      return { ok: false, terminal: 'blocked', reason: 'auth-required', issue: getErrorMessage(error) };
    }
    if (error instanceof TimeoutError) {
      return { ok: false, terminal: 'needs-human-check', issue: getErrorMessage(error) };
    }
    if (error instanceof CommandExecutionError) {
      return { ok: false, terminal: 'needs-human-check', issue: getErrorMessage(error) };
    }
    return { ok: false, terminal: 'needs-human-check', issue: getErrorMessage(error) };
  }
}

async function probeCandidateStrategy(page: IPage, endpointUrl: string): Promise<SupportedStrategy | null> {
  const { cascadeProbe } = await import('./cascade.js');
  const result = await cascadeProbe(page, endpointUrl, { maxStrategy: Strategy.COOKIE });
  const success = result.probes.find((probe) => probe.success);
  return parseSupportedStrategy(success?.strategy);
}

async function registerVerifiedAdapter(candidate: CandidateYaml): Promise<string> {
  const siteDir = path.join(USER_CLIS_DIR, candidate.site);
  const filePath = path.join(siteDir, `${candidate.name}.yaml`);
  await fs.promises.mkdir(siteDir, { recursive: true });
  await fs.promises.writeFile(filePath, yaml.dump(candidate, { sortKeys: false, lineWidth: 120 }));
  registerCommand(candidateToCommand(candidate, filePath));
  return filePath;
}

async function writeVerifiedArtifact(candidate: CandidateYaml, exploreDir: string): Promise<string> {
  const outDir = path.join(exploreDir, 'verified');
  const filePath = path.join(outDir, `${candidate.name}.verified.yaml`);
  await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(filePath, yaml.dump(candidate, { sortKeys: false, lineWidth: 120 }));
  return filePath;
}

function classifySessionError(
  error: unknown,
  summary: SynthesizeCandidateSummary,
  stats: GenerateStats,
  site: string,
): GenerateOutcome {
  if (error instanceof BrowserConnectError) {
    return { version: 1, status: 'blocked', reason: 'browser-unavailable', stats };
  }
  if (error instanceof AuthRequiredError) {
    return { version: 1, status: 'blocked', reason: 'auth-required', stats };
  }
  return {
    version: 1,
    status: 'needs-human-check',
    candidate: buildCandidateInfo(site, summary),
    issue: getErrorMessage(error),
    stats,
  };
}

export async function generateVerifiedFromUrl(opts: GenerateVerifiedOptions): Promise<GenerateOutcome> {
  const normalizedGoal = normalizeGoal(opts.goal) ?? opts.goal ?? undefined;
  const exploreResult = await exploreUrl(opts.url, {
    BrowserFactory: opts.BrowserFactory,
    site: opts.site,
    goal: normalizedGoal,
    waitSeconds: opts.waitSeconds ?? 3,
    workspace: opts.workspace,
  });

  const bundle = loadExploreBundle(exploreResult.out_dir) as ExploreBundleLike;
  const synthesizeResult = synthesizeFromExplore(exploreResult.out_dir, { top: opts.top ?? 3 });
  const selected = selectCandidate(synthesizeResult.candidates ?? [], opts.goal);

  const baseStats = buildStats({
    endpointCount: exploreResult.endpoint_count,
    apiEndpointCount: exploreResult.api_endpoint_count,
    candidateCount: synthesizeResult.candidate_count,
    exploreDir: exploreResult.out_dir,
  });

  if (exploreResult.api_endpoint_count === 0) {
    return { version: 1, status: 'blocked', reason: 'no-api-discovered', stats: baseStats };
  }

  if (!selected || synthesizeResult.candidate_count === 0) {
    return { version: 1, status: 'blocked', reason: 'no-viable-candidate', stats: baseStats };
  }

  const context: CandidateContext = {
    capability: bundle.capabilities.find((capability) => capability.name === selected.name),
    endpoint: chooseEndpoint(bundle.capabilities.find((capability) => capability.name === selected.name), bundle.endpoints),
  };

  if (!context.endpoint) {
    return { version: 1, status: 'blocked', reason: 'no-viable-candidate', stats: baseStats };
  }

  const expectedFields = Object.keys(context.endpoint.detectedFields ?? {});
  const originalCandidate = readCandidateYaml(selected.path);
  const unsupportedArgs = getUnsupportedVerificationArgs(originalCandidate);

  if (unsupportedArgs.length > 0) {
    return {
      version: 1,
      status: 'needs-human-check',
      candidate: buildCandidateInfo(bundle.manifest.site, selected),
      issue: `auto-verification does not support required args: ${unsupportedArgs.join(', ')}`,
      stats: baseStats,
    };
  }

  try {
    return await browserSession(opts.BrowserFactory, async (page) => {
      await page.goto(bundle.manifest.final_url ?? bundle.manifest.target_url);

      const bestStrategy = await probeCandidateStrategy(page, context.endpoint!.url);
      if (!bestStrategy) {
        return {
          version: 1,
          status: 'blocked',
          reason: 'auth-required',
          stats: baseStats,
        };
      }

      const candidate = applyStrategy(originalCandidate, bestStrategy);
      const firstAttempt = await verifyCandidate(page, candidate, expectedFields);
      if (firstAttempt.ok) {
        const finalPath = opts.noRegister
          ? await writeVerifiedArtifact(candidate, exploreResult.out_dir)
          : await registerVerifiedAdapter(candidate);
        return {
          version: 1,
          status: 'success',
          adapter: {
            site: candidate.site,
            name: candidate.name,
            command: commandName(candidate.site, candidate.name),
            strategy: bestStrategy,
            path: finalPath,
          },
          stats: buildStats({
            endpointCount: exploreResult.endpoint_count,
            apiEndpointCount: exploreResult.api_endpoint_count,
            candidateCount: synthesizeResult.candidate_count,
            verified: true,
            repairAttempted: false,
            exploreDir: exploreResult.out_dir,
          }),
        };
      }

      if ('terminal' in firstAttempt) {
        if (firstAttempt.terminal === 'blocked') {
          return {
            version: 1,
            status: 'blocked',
            reason: firstAttempt.reason ?? 'browser-unavailable',
            stats: baseStats,
          };
        }
        return {
          version: 1,
          status: 'needs-human-check',
          candidate: buildCandidateInfo(bundle.manifest.site, selected),
          issue: firstAttempt.issue,
          stats: baseStats,
        };
      }

      const repaired = firstAttempt.reason === 'empty-result'
        ? withItemPath(candidate, context.endpoint?.itemPath ?? null)
        : null;

      if (!repaired) {
        return {
          version: 1,
          status: 'needs-human-check',
          candidate: buildCandidateInfo(bundle.manifest.site, selected),
          issue: firstAttempt.reason,
          stats: buildStats({
            endpointCount: exploreResult.endpoint_count,
            apiEndpointCount: exploreResult.api_endpoint_count,
            candidateCount: synthesizeResult.candidate_count,
            repairAttempted: firstAttempt.reason === 'empty-result',
            exploreDir: exploreResult.out_dir,
          }),
        };
      }

      const secondAttempt = await verifyCandidate(page, repaired, expectedFields);
      if (secondAttempt.ok) {
        const finalPath = opts.noRegister
          ? await writeVerifiedArtifact(repaired, exploreResult.out_dir)
          : await registerVerifiedAdapter(repaired);
        return {
          version: 1,
          status: 'success',
          adapter: {
            site: repaired.site,
            name: repaired.name,
            command: commandName(repaired.site, repaired.name),
            strategy: bestStrategy,
            path: finalPath,
          },
          stats: buildStats({
            endpointCount: exploreResult.endpoint_count,
            apiEndpointCount: exploreResult.api_endpoint_count,
            candidateCount: synthesizeResult.candidate_count,
            verified: true,
            repairAttempted: true,
            exploreDir: exploreResult.out_dir,
          }),
        };
      }

      if ('terminal' in secondAttempt) {
        if (secondAttempt.terminal === 'blocked') {
          return {
            version: 1,
            status: 'blocked',
            reason: secondAttempt.reason ?? 'browser-unavailable',
            stats: buildStats({
              endpointCount: exploreResult.endpoint_count,
              apiEndpointCount: exploreResult.api_endpoint_count,
              candidateCount: synthesizeResult.candidate_count,
              repairAttempted: true,
              exploreDir: exploreResult.out_dir,
            }),
          };
        }
        return {
          version: 1,
          status: 'needs-human-check',
          candidate: buildCandidateInfo(bundle.manifest.site, selected),
          issue: secondAttempt.issue,
          stats: buildStats({
            endpointCount: exploreResult.endpoint_count,
            apiEndpointCount: exploreResult.api_endpoint_count,
            candidateCount: synthesizeResult.candidate_count,
            repairAttempted: true,
            exploreDir: exploreResult.out_dir,
          }),
        };
      }

      return {
        version: 1,
        status: 'needs-human-check',
        candidate: buildCandidateInfo(bundle.manifest.site, selected),
        issue: secondAttempt.reason,
        stats: buildStats({
          endpointCount: exploreResult.endpoint_count,
          apiEndpointCount: exploreResult.api_endpoint_count,
          candidateCount: synthesizeResult.candidate_count,
          repairAttempted: true,
          exploreDir: exploreResult.out_dir,
        }),
      };
    }, { workspace: opts.workspace });
  } catch (error) {
    return classifySessionError(error, selected, baseStats, bundle.manifest.site);
  }
}

export function renderGenerateVerifiedSummary(result: GenerateOutcome): string {
  const lines = [
    `opencli generate: ${result.status.toUpperCase()}`,
    `Schema version: ${result.version}`,
  ];

  if (result.status === 'success' && result.adapter) {
    lines.push(`Command: ${result.adapter.command}`);
    lines.push(`Strategy: ${result.adapter.strategy}`);
    lines.push(`Path: ${result.adapter.path}`);
  } else if (result.status === 'blocked' && result.reason) {
    lines.push(`Reason: ${result.reason}`);
  } else if (result.status === 'needs-human-check' && result.candidate) {
    lines.push(`Candidate: ${result.candidate.command}`);
    if (result.issue) lines.push(`Issue: ${result.issue}`);
  }

  lines.push('');
  lines.push(`Explore: ${result.stats.endpoint_count} endpoints, ${result.stats.api_endpoint_count} API`);
  lines.push(`Candidates: ${result.stats.candidate_count}`);
  lines.push(`Verified: ${result.stats.verified ? 'yes' : 'no'}`);
  lines.push(`Repair attempted: ${result.stats.repair_attempted ? 'yes' : 'no'}`);

  return lines.join('\n');
}
