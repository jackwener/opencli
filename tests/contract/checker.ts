/**
 * Contract checker: runs CLI commands, extracts schemas,
 * compares against previous snapshots, and reports drift.
 * Run via: npx tsx tests/contract/checker.ts
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractSchema,
  diffSchemas,
  formatReport,
  buildReport,
  type CommandSchema,
  type ContractResult,
} from './schema.js';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MAIN = path.join(ROOT, 'dist', 'main.js');
/** 快照目录：CI 通过环境变量覆盖，本地默认 contract-snapshots/ */
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR
  ? path.resolve(process.env.SNAPSHOT_DIR)
  : path.join(ROOT, 'contract-snapshots');
const COMMAND_TIMEOUT = 30_000;

/** 命令定义（固定测试参数） */
interface CheckTarget {
  site: string;
  command: string;
  args?: string[];
}

/** 所有需要检测的命令，新增条目在此追加 */
const TARGETS: CheckTarget[] = [
  { site: 'hackernews', command: 'top', args: ['--limit', '10'] },
  { site: 'hackernews', command: 'best', args: ['--limit', '10'] },
  { site: 'hackernews', command: 'new', args: ['--limit', '10'] },
  { site: 'hackernews', command: 'show', args: ['--limit', '10'] },
  { site: 'hackernews', command: 'ask', args: ['--limit', '10'] },
  { site: 'hackernews', command: 'jobs', args: ['--limit', '10'] },
  { site: 'v2ex', command: 'hot', args: ['--limit', '10'] },
  { site: 'v2ex', command: 'latest', args: ['--limit', '10'] },
  { site: 'bloomberg', command: 'main', args: ['--limit', '10'] },
  { site: 'bloomberg', command: 'markets', args: ['--limit', '10'] },
  { site: 'bloomberg', command: 'tech', args: ['--limit', '10'] },
  { site: 'apple-podcasts', command: 'top', args: ['--limit', '10'] },
  { site: 'apple-podcasts', command: 'search', args: ['podcast', '--limit', '10'] },
  { site: 'arxiv', command: 'search', args: ['machine learning', '--limit', '10'] },
  { site: 'bbc', command: 'news', args: ['--limit', '10'] },
  { site: 'devto', command: 'top', args: ['--limit', '10'] },
  { site: 'lobsters', command: 'hot', args: ['--limit', '10'] },
  { site: 'stackoverflow', command: 'hot', args: ['--limit', '10'] },
  { site: 'steam', command: 'top-sellers', args: ['--limit', '10'] },
  { site: 'wikipedia', command: 'search', args: ['linux', '--limit', '10'] },
  { site: 'wikipedia', command: 'trending', args: ['--limit', '10'] },
  { site: 'sinafinance', command: 'news', args: ['--limit', '10'] },
  { site: 'weread', command: 'ranking', args: ['--limit', '10'] },
  // "Jokes Aside" podcast by Maotouying Comedy
  { site: 'xiaoyuzhou', command: 'podcast', args: ['61791d921989541784257779'] },
  { site: 'yollomi', command: 'models' },
];

/** 快照文件路径 */
function snapshotPath(site: string, command: string): string {
  return path.join(SNAPSHOT_DIR, `${site}_${command}.json`);
}

/** 加载命令的前一次快照，首次运行返回 null */
function loadSnapshot(site: string, command: string): CommandSchema | null {
  const p = snapshotPath(site, command);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Validate snapshot structure to avoid crashes in diffSchemas
    if (!data || typeof data !== 'object' || typeof data.fields !== 'object' || typeof data.rowCount !== 'number') {
      console.warn(`Warning: invalid snapshot structure for ${site}/${command}, treating as first run`);
      return null;
    }
    return data as CommandSchema;
  } catch (err) {
    console.warn(`Warning: corrupt snapshot for ${site}/${command}, treating as first run:`, err);
    return null;
  }
}

/** Atomic write: write to .tmp then rename, preventing truncated JSON from CI cancel */
function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

/** 保存命令快照 */
function saveSnapshot(schema: CommandSchema, site: string, command: string): void {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  atomicWrite(snapshotPath(site, command), JSON.stringify(schema, null, 2) + '\n');
}

/** Failure metadata directory (separate from snapshots, persists across drift events) */
function failureMetaDir(): string {
  return path.join(SNAPSHOT_DIR, '_failures');
}

/** 读取命令的连续失败次数 */
function loadFailureCount(site: string, command: string): number {
  const metaPath = path.join(failureMetaDir(), `${site}_${command}.json`);
  if (!fs.existsSync(metaPath)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

/** Save consecutive failure count; deletes the file when count=0 */
function saveFailureCount(site: string, command: string, count: number): void {
  const dir = failureMetaDir();
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, `${site}_${command}.json`);
  if (count === 0) {
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  } else {
    atomicWrite(metaPath, JSON.stringify({ count }) + '\n');
  }
}

/** 运行单条 CLI 命令，返回解析后的 JSON 数组 */
async function runCommand(target: CheckTarget): Promise<{ data: unknown[] | null; error?: string }> {
  const cliArgs = [MAIN, target.site, target.command, ...(target.args ?? []), '-f', 'json'];
  try {
    const { stdout } = await exec('node', cliArgs, {
      cwd: ROOT,
      timeout: COMMAND_TIMEOUT,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    const parsed = JSON.parse(stdout.trim());
    if (!Array.isArray(parsed)) return { data: null, error: 'Response is not an array' };
    return { data: parsed };
  } catch (err: any) {
    const msg = err.stderr?.trim() || err.message || 'Unknown error';
    const exitCode = err.status ?? err.code ?? 'unknown';
    return { data: null, error: `Exit code ${exitCode}: ${msg.slice(0, 200)}` };
  }
}

/** Main entry: iterate commands, extract schemas, diff against snapshots, generate report */
async function main(): Promise<void> {
  // Remove stale drift-report from previous artifact download to avoid uploading old report on crash
  const staleReport = path.join(SNAPSHOT_DIR, 'drift-report.json');
  if (fs.existsSync(staleReport)) fs.unlinkSync(staleReport);

  const results: ContractResult[] = [];

  for (const target of TARGETS) {
    const cmd = `${target.site}/${target.command}`;
    const { data, error } = await runCommand(target);

    // 响应失败或为空
    if (!data || data.length === 0) {
      const prevFailures = loadFailureCount(target.site, target.command);
      const consecutiveFailures = prevFailures + 1;
      saveFailureCount(target.site, target.command, consecutiveFailures);
      results.push({
        command: cmd,
        status: 'failed',
        error: error ?? 'empty response',
        consecutiveFailures,
      });
      continue;
    }

    const schema = extractSchema(data, cmd);

    // 全部行非对象，视为失败
    if (schema.rowCount === 0) {
      const prevFailures = loadFailureCount(target.site, target.command);
      const consecutiveFailures = prevFailures + 1;
      saveFailureCount(target.site, target.command, consecutiveFailures);
      results.push({
        command: cmd,
        status: 'failed',
        error: 'no valid object rows in response',
        consecutiveFailures,
      });
      continue;
    }

    // 成功时重置连续失败计数
    saveFailureCount(target.site, target.command, 0);

    const prev = loadSnapshot(target.site, target.command);

    if (!prev) {
      // 首次运行：保存基线，不做对比
      saveSnapshot(schema, target.site, target.command);
      results.push({ command: cmd, status: 'passed', diffs: [] });
      continue;
    }

    const diffs = diffSchemas(prev, schema);
    if (diffs.length > 0) {
      // 检测到漂移：不更新快照（保留基线）
      results.push({ command: cmd, status: 'drifted', diffs });
    } else {
      // 无漂移：用最新数据更新快照
      saveSnapshot(schema, target.site, target.command);
      results.push({ command: cmd, status: 'passed', diffs: [] });
    }
  }

  // 统一时间戳，避免跨日不一致
  const now = new Date();

  // 输出人类可读摘要
  console.log(formatReport(results, now));

  // Write JSON report for CI artifact upload
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const report = buildReport(results, now);
  atomicWrite(
    path.join(SNAPSHOT_DIR, 'drift-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );

  // Exit with error if drift detected or if zero commands passed (total outage)
  const hasDrift = results.some(r => r.status === 'drifted');
  const passedCount = results.filter(r => r.status === 'passed').length;
  if (hasDrift) {
    process.exit(1);
  }
  if (passedCount === 0 && results.length > 0) {
    console.error('Error: no commands passed — all failed or drifted');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Contract checker failed:', err);
  process.exit(2);
});
