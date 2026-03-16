import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { IPage } from './types.js';
import { PlaywrightMCP, discoverChromeEndpoint, getTokenFingerprint } from './browser.js';
import { browserSession } from './runtime.js';

const PLAYWRIGHT_SERVER_NAME = 'playwright';
const PLAYWRIGHT_TOKEN_ENV = 'PLAYWRIGHT_MCP_EXTENSION_TOKEN';
const PLAYWRIGHT_EXTENSION_ID = 'mmlmfjhmonkocbjadbfplnigmagldckm';
const TOKEN_LINE_RE = /^(\s*export\s+PLAYWRIGHT_MCP_EXTENSION_TOKEN=)(['"]?)([^'"\\\n]+)\2\s*$/m;
export type DoctorOptions = {
  fix?: boolean;
  yes?: boolean;
  shellRc?: string;
  configPaths?: string[];
  token?: string;
  cliVersion?: string;
};

export type ShellFileStatus = {
  path: string;
  exists: boolean;
  token: string | null;
  fingerprint: string | null;
};

export type McpConfigFormat = 'json' | 'toml';

export type McpConfigStatus = {
  path: string;
  exists: boolean;
  format: McpConfigFormat;
  token: string | null;
  fingerprint: string | null;
  writable: boolean;
  parseError?: string;
};

export type DoctorReport = {
  cliVersion?: string;
  envToken: string | null;
  envFingerprint: string | null;
  shellFiles: ShellFileStatus[];
  configs: McpConfigStatus[];
  remoteDebuggingEnabled: boolean;
  remoteDebuggingEndpoint: string | null;
  cdpEnabled: boolean;
  cdpToken: string | null;
  cdpFingerprint: string | null;
  recommendedToken: string | null;
  recommendedFingerprint: string | null;
  warnings: string[];
  issues: string[];
};

type ReportStatus = 'OK' | 'MISSING' | 'MISMATCH' | 'WARN';

function label(status: ReportStatus): string {
  return `[${status}]`;
}

function statusLine(status: ReportStatus, text: string): string {
  return `${label(status)} ${text}`;
}

function tokenSummary(token: string | null, fingerprint: string | null): string {
  if (!token) return 'missing';
  return `configured (${fingerprint})`;
}

export function getDefaultShellRcPath(): string {
  const shell = process.env.SHELL ?? '';
  if (shell.endsWith('/bash')) return path.join(os.homedir(), '.bashrc');
  if (shell.endsWith('/fish')) return path.join(os.homedir(), '.config', 'fish', 'config.fish');
  return path.join(os.homedir(), '.zshrc');
}

export function getDefaultMcpConfigPaths(cwd: string = process.cwd()): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.codex', 'config.toml'),
    path.join(home, '.codex', 'mcp.json'),
    path.join(home, '.cursor', 'mcp.json'),
    path.join(home, '.config', 'opencode', 'opencode.json'),
    path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    path.join(cwd, '.cursor', 'mcp.json'),
    path.join(cwd, '.vscode', 'mcp.json'),
    path.join(cwd, '.opencode', 'opencode.json'),
  ];
  return [...new Set(candidates)];
}

export function readTokenFromShellContent(content: string): string | null {
  const m = content.match(TOKEN_LINE_RE);
  return m?.[3] ?? null;
}

export function upsertShellToken(content: string, token: string): string {
  const nextLine = `export ${PLAYWRIGHT_TOKEN_ENV}="${token}"`;
  if (!content.trim()) return `${nextLine}\n`;
  if (TOKEN_LINE_RE.test(content)) return content.replace(TOKEN_LINE_RE, `$1"${
    token
  }"`);
  return `${content.replace(/\s*$/, '')}\n${nextLine}\n`;
}

function readJsonConfigToken(content: string): string | null {
  try {
    const parsed = JSON.parse(content);
    return readTokenFromJsonObject(parsed);
  } catch {
    return null;
  }
}

function readTokenFromJsonObject(parsed: any): string | null {
  const direct = parsed?.mcpServers?.[PLAYWRIGHT_SERVER_NAME]?.env?.[PLAYWRIGHT_TOKEN_ENV];
  if (typeof direct === 'string' && direct) return direct;
  const opencode = parsed?.mcp?.[PLAYWRIGHT_SERVER_NAME]?.env?.[PLAYWRIGHT_TOKEN_ENV];
  if (typeof opencode === 'string' && opencode) return opencode;
  return null;
}

export function upsertJsonConfigToken(content: string, token: string): string {
  const parsed = content.trim() ? JSON.parse(content) : {};
  if (parsed?.mcpServers) {
    parsed.mcpServers[PLAYWRIGHT_SERVER_NAME] = parsed.mcpServers[PLAYWRIGHT_SERVER_NAME] ?? {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--extension'],
    };
    parsed.mcpServers[PLAYWRIGHT_SERVER_NAME].env = parsed.mcpServers[PLAYWRIGHT_SERVER_NAME].env ?? {};
    parsed.mcpServers[PLAYWRIGHT_SERVER_NAME].env[PLAYWRIGHT_TOKEN_ENV] = token;
  } else {
    parsed.mcp = parsed.mcp ?? {};
    parsed.mcp[PLAYWRIGHT_SERVER_NAME] = parsed.mcp[PLAYWRIGHT_SERVER_NAME] ?? {
      command: ['npx', '-y', '@playwright/mcp@latest', '--extension'],
      enabled: true,
      type: 'local',
    };
    parsed.mcp[PLAYWRIGHT_SERVER_NAME].env = parsed.mcp[PLAYWRIGHT_SERVER_NAME].env ?? {};
    parsed.mcp[PLAYWRIGHT_SERVER_NAME].env[PLAYWRIGHT_TOKEN_ENV] = token;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function readTomlConfigToken(content: string): string | null {
  const sectionMatch = content.match(/\[mcp_servers\.playwright\.env\][\s\S]*?(?=\n\[|$)/);
  if (!sectionMatch) return null;
  const tokenMatch = sectionMatch[0].match(/^\s*PLAYWRIGHT_MCP_EXTENSION_TOKEN\s*=\s*"([^"\n]+)"/m);
  return tokenMatch?.[1] ?? null;
}

export function upsertTomlConfigToken(content: string, token: string): string {
  const envSectionRe = /(\[mcp_servers\.playwright\.env\][\s\S]*?)(?=\n\[|$)/;
  const tokenLine = `PLAYWRIGHT_MCP_EXTENSION_TOKEN = "${token}"`;
  if (envSectionRe.test(content)) {
    return content.replace(envSectionRe, (section) => {
      if (/^\s*PLAYWRIGHT_MCP_EXTENSION_TOKEN\s*=/m.test(section)) {
        return section.replace(/^\s*PLAYWRIGHT_MCP_EXTENSION_TOKEN\s*=.*$/m, tokenLine);
      }
      return `${section.replace(/\s*$/, '')}\n${tokenLine}\n`;
    });
  }

  const baseSectionRe = /(\[mcp_servers\.playwright\][\s\S]*?)(?=\n\[|$)/;
  if (baseSectionRe.test(content)) {
    return content.replace(baseSectionRe, (section) => `${section.replace(/\s*$/, '')}\n\n[mcp_servers.playwright.env]\n${tokenLine}\n`);
  }

  const prefix = content.trim() ? `${content.replace(/\s*$/, '')}\n\n` : '';
  return `${prefix}[mcp_servers.playwright]\ntype = "stdio"\ncommand = "npx"\nargs = ["-y", "@playwright/mcp@latest", "--extension"]\n\n[mcp_servers.playwright.env]\n${tokenLine}\n`;
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function canWrite(filePath: string): boolean {
  try {
    if (fileExists(filePath)) {
      fs.accessSync(filePath, fs.constants.W_OK);
      return true;
    }
    fs.accessSync(path.dirname(filePath), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function readConfigStatus(filePath: string): McpConfigStatus {
  const format: McpConfigFormat = filePath.endsWith('.toml') ? 'toml' : 'json';
  if (!fileExists(filePath)) {
    return { path: filePath, exists: false, format, token: null, fingerprint: null, writable: canWrite(filePath) };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const token = format === 'toml' ? readTomlConfigToken(content) : readJsonConfigToken(content);
    return {
      path: filePath,
      exists: true,
      format,
      token,
      fingerprint: getTokenFingerprint(token ?? undefined),
      writable: canWrite(filePath),
    };
  } catch (error: any) {
    return {
      path: filePath,
      exists: true,
      format,
      token: null,
      fingerprint: null,
      writable: canWrite(filePath),
      parseError: error?.message ?? String(error),
    };
  }
}

async function extractTokenViaCdp(): Promise<string | null> {
  if (!(process.env.OPENCLI_USE_CDP === '1' || process.env.OPENCLI_CDP_ENDPOINT))
    return null;
  const candidates = [
    `chrome-extension://${PLAYWRIGHT_EXTENSION_ID}/options.html`,
    `chrome-extension://${PLAYWRIGHT_EXTENSION_ID}/popup.html`,
    `chrome-extension://${PLAYWRIGHT_EXTENSION_ID}/connect.html`,
    `chrome-extension://${PLAYWRIGHT_EXTENSION_ID}/index.html`,
  ];
  const result = await browserSession(PlaywrightMCP, async (page: IPage) => {
    for (const url of candidates) {
      try {
        await page.goto(url);
        await page.wait(1);
        const token = await page.evaluate(`() => {
          const values = new Set();
          const push = (value) => {
            if (!value || typeof value !== 'string') return;
            for (const match of value.matchAll(/[A-Za-z0-9_-]{24,}/g)) values.add(match[0]);
          };
          document.querySelectorAll('input, textarea, code, pre, span, div').forEach((el) => {
            push(el.value);
            push(el.textContent || '');
            push(el.getAttribute && el.getAttribute('value'));
          });
          return Array.from(values);
        }`);
        const matches = Array.isArray(token) ? token.filter((v: string) => v.length >= 24) : [];
        if (matches.length > 0) return matches.sort((a: string, b: string) => b.length - a.length)[0];
      } catch {}
    }
    return null;
  });
  return typeof result === 'string' && result ? result : null;
}

export async function runBrowserDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const envToken = process.env[PLAYWRIGHT_TOKEN_ENV] ?? null;
  const remoteDebuggingEndpoint = await discoverChromeEndpoint().catch(() => null);
  const shellPath = opts.shellRc ?? getDefaultShellRcPath();
  const shellFiles: ShellFileStatus[] = [shellPath].map((filePath) => {
    if (!fileExists(filePath)) return { path: filePath, exists: false, token: null, fingerprint: null };
    const content = fs.readFileSync(filePath, 'utf-8');
    const token = readTokenFromShellContent(content);
    return { path: filePath, exists: true, token, fingerprint: getTokenFingerprint(token ?? undefined) };
  });
  const configPaths = opts.configPaths?.length ? opts.configPaths : getDefaultMcpConfigPaths();
  const configs = configPaths.map(readConfigStatus);
  const cdpToken = !opts.token && !envToken ? await extractTokenViaCdp().catch(() => null) : null;

  const allTokens = [
    opts.token ?? null,
    envToken,
    ...shellFiles.map(s => s.token),
    ...configs.map(c => c.token),
    cdpToken,
  ].filter((v): v is string => !!v);
  const uniqueTokens = [...new Set(allTokens)];
  const recommendedToken = opts.token ?? envToken ?? (uniqueTokens.length === 1 ? uniqueTokens[0] : cdpToken) ?? null;

  const report: DoctorReport = {
    cliVersion: opts.cliVersion,
    envToken,
    envFingerprint: getTokenFingerprint(envToken ?? undefined),
    shellFiles,
    configs,
    remoteDebuggingEnabled: !!remoteDebuggingEndpoint,
    remoteDebuggingEndpoint,
    cdpEnabled: process.env.OPENCLI_USE_CDP === '1' || !!process.env.OPENCLI_CDP_ENDPOINT,
    cdpToken,
    cdpFingerprint: getTokenFingerprint(cdpToken ?? undefined),
    recommendedToken,
    recommendedFingerprint: getTokenFingerprint(recommendedToken ?? undefined),
    warnings: [],
    issues: [],
  };

  if (!envToken) report.issues.push(`Current environment is missing ${PLAYWRIGHT_TOKEN_ENV}.`);
  if (!shellFiles.some(s => s.token)) report.issues.push('Shell startup file does not export PLAYWRIGHT_MCP_EXTENSION_TOKEN.');
  if (!configs.some(c => c.token)) report.issues.push('No scanned MCP config currently contains a Playwright extension token.');
  if (uniqueTokens.length > 1) report.issues.push('Detected inconsistent Playwright MCP tokens across env/config files.');
  if (!report.remoteDebuggingEnabled) report.warnings.push('Chrome remote debugging appears to be disabled or Chrome is not currently exposing a DevTools endpoint.');
  for (const config of configs) {
    if (config.parseError) report.warnings.push(`Could not parse ${config.path}: ${config.parseError}`);
  }
  if (!recommendedToken) {
    if (report.cdpEnabled) report.warnings.push('CDP is enabled, but no token could be extracted automatically from the extension UI.');
    else report.warnings.push('No token source found. Enable OPENCLI_USE_CDP=1 to allow a best-effort token read from the extension page.');
  }
  return report;
}

export function renderBrowserDoctorReport(report: DoctorReport): string {
  const tokenFingerprints = [
    report.envFingerprint,
    ...report.shellFiles.map(shell => shell.fingerprint),
    ...report.configs.filter(config => config.exists).map(config => config.fingerprint),
  ].filter((value): value is string => !!value);
  const uniqueFingerprints = [...new Set(tokenFingerprints)];
  const hasMismatch = uniqueFingerprints.length > 1;
  const lines = [`opencli v${report.cliVersion ?? 'unknown'} doctor`, ''];
  lines.push(statusLine(report.remoteDebuggingEnabled ? 'OK' : 'WARN', `Chrome remote debugging: ${report.remoteDebuggingEnabled ? 'enabled' : 'disabled'}`));
  if (report.remoteDebuggingEndpoint) lines.push(`     ${report.remoteDebuggingEndpoint}`);

  const envStatus: ReportStatus = !report.envToken ? 'MISSING' : hasMismatch ? 'MISMATCH' : 'OK';
  lines.push(statusLine(envStatus, `Environment token: ${tokenSummary(report.envToken, report.envFingerprint)}`));

  for (const shell of report.shellFiles) {
    const shellStatus: ReportStatus = !shell.token ? 'MISSING' : hasMismatch ? 'MISMATCH' : 'OK';
    lines.push(statusLine(shellStatus, `Shell file ${shell.path}: ${tokenSummary(shell.token, shell.fingerprint)}`));
  }
  const existingConfigs = report.configs.filter(config => config.exists);
  const missingConfigCount = report.configs.length - existingConfigs.length;
  if (existingConfigs.length > 0) {
    for (const config of existingConfigs) {
      const parseSuffix = config.parseError ? ` (parse error: ${config.parseError})` : '';
      const configStatus: ReportStatus = config.parseError
        ? 'WARN'
        : !config.token
          ? 'MISSING'
          : hasMismatch
            ? 'MISMATCH'
            : 'OK';
      lines.push(statusLine(configStatus, `MCP config ${config.path}: ${tokenSummary(config.token, config.fingerprint)}${parseSuffix}`));
    }
  } else {
    lines.push(statusLine('MISSING', 'MCP config: no existing config files found in scanned locations'));
  }
  if (missingConfigCount > 0) lines.push(`     Other scanned config locations not present: ${missingConfigCount}`);
  if (report.cdpEnabled) {
    const cdpStatus: ReportStatus = report.cdpToken ? 'OK' : 'WARN';
    lines.push(statusLine(cdpStatus, `CDP token probe: ${tokenSummary(report.cdpToken, report.cdpFingerprint)}`));
  }
  lines.push('');
  lines.push(statusLine(
    hasMismatch ? 'MISMATCH' : report.recommendedToken ? 'OK' : 'WARN',
    `Recommended token fingerprint: ${report.recommendedFingerprint ?? 'unavailable'}`,
  ));
  if (report.issues.length) {
    lines.push('', 'Issues:');
    for (const issue of report.issues) lines.push(`- ${issue}`);
  }
  if (report.warnings.length) {
    lines.push('', 'Warnings:');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  return lines.join('\n');
}

async function confirmPrompt(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

function writeFileWithMkdir(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export async function applyBrowserDoctorFix(report: DoctorReport, opts: DoctorOptions = {}): Promise<string[]> {
  const token = opts.token ?? report.recommendedToken;
  if (!token) throw new Error('No Playwright MCP token is available to write. Provide --token or enable CDP token probing first.');

  const plannedWrites: string[] = [];
  const shellPath = opts.shellRc ?? report.shellFiles[0]?.path ?? getDefaultShellRcPath();
  plannedWrites.push(shellPath);
  for (const config of report.configs) {
    if (!config.writable) continue;
    plannedWrites.push(config.path);
  }

  if (!opts.yes) {
    const ok = await confirmPrompt(`Update ${plannedWrites.length} file(s) with Playwright MCP token fingerprint ${getTokenFingerprint(token)}?`);
    if (!ok) return [];
  }

  const written: string[] = [];
  const shellBefore = fileExists(shellPath) ? fs.readFileSync(shellPath, 'utf-8') : '';
  writeFileWithMkdir(shellPath, upsertShellToken(shellBefore, token));
  written.push(shellPath);

  for (const config of report.configs) {
    if (!config.writable || config.parseError) continue;
    const before = fileExists(config.path) ? fs.readFileSync(config.path, 'utf-8') : '';
    const next = config.format === 'toml' ? upsertTomlConfigToken(before, token) : upsertJsonConfigToken(before, token);
    writeFileWithMkdir(config.path, next);
    written.push(config.path);
  }

  process.env[PLAYWRIGHT_TOKEN_ENV] = token;
  return written;
}
