import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import type { IPage } from './types.js';
import { PlaywrightMCP, getTokenFingerprint, resolveCdpEndpoint } from './browser/index.js';
import { browserSession } from './runtime.js';

const PLAYWRIGHT_SERVER_NAME = 'playwright';
export const PLAYWRIGHT_TOKEN_ENV = 'PLAYWRIGHT_MCP_EXTENSION_TOKEN';
const PLAYWRIGHT_EXTENSION_ID = 'mmlmfjhmonkocbjadbfplnigmagldckm';
const TOKEN_LINE_RE = /^(\s*export\s+PLAYWRIGHT_MCP_EXTENSION_TOKEN=)(['"]?)([^'"\\\n]+)\2\s*$/m;
export type DoctorOptions = {
  fix?: boolean;
  yes?: boolean;
  live?: boolean;
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

export type ConnectivityResult = {
  ok: boolean;
  error?: string;
  durationMs: number;
};

export type DoctorReport = {
  cliVersion?: string;
  envToken: string | null;
  envFingerprint: string | null;
  extensionToken: string | null;
  extensionFingerprint: string | null;
  extensionInstalled: boolean;
  extensionBrowsers: string[];
  shellFiles: ShellFileStatus[];
  configs: McpConfigStatus[];
  recommendedToken: string | null;
  recommendedFingerprint: string | null;
  connectivity?: ConnectivityResult;
  warnings: string[];
  issues: string[];
};

type ReportStatus = 'OK' | 'MISSING' | 'MISMATCH' | 'WARN';

function colorLabel(status: ReportStatus): string {
  switch (status) {
    case 'OK':       return chalk.green('[OK]');
    case 'MISSING':  return chalk.red('[MISSING]');
    case 'MISMATCH': return chalk.yellow('[MISMATCH]');
    case 'WARN':     return chalk.yellow('[WARN]');
  }
}

function statusLine(status: ReportStatus, text: string): string {
  return `${colorLabel(status)} ${text}`;
}

function tokenSummary(token: string | null, fingerprint: string | null): string {
  if (!token) return chalk.dim('missing');
  return `configured ${chalk.dim(`(${fingerprint})`)}`;
}

export function shortenPath(p: string): string {
  const home = os.homedir();
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

export function toolName(p: string): string {
  if (p.includes('.codex/')) return 'Codex';
  if (p.includes('.cursor/')) return 'Cursor';
  if (p.includes('.claude.json')) return 'Claude Code';
  if (p.includes('antigravity')) return 'Antigravity';
  if (p.includes('.gemini/settings')) return 'Gemini CLI';
  if (p.includes('opencode')) return 'OpenCode';
  if (p.includes('Claude/claude_desktop')) return 'Claude Desktop';
  if (p.includes('.vscode/')) return 'VS Code';
  if (p.includes('.mcp.json')) return 'Project MCP';
  if (p.includes('.zshrc') || p.includes('.bashrc') || p.includes('.profile')) return 'Shell';
  return '';
}

export function getDefaultShellRcPath(): string {
  const shell = process.env.SHELL ?? '';
  if (shell.endsWith('/bash')) return path.join(os.homedir(), '.bashrc');
  if (shell.endsWith('/fish')) return path.join(os.homedir(), '.config', 'fish', 'config.fish');
  return path.join(os.homedir(), '.zshrc');
}

function isFishConfig(filePath: string): boolean {
  return filePath.endsWith('config.fish') || filePath.includes('/fish/');
}

/** Detect if a JSON config file uses OpenCode's `mcp` format vs standard `mcpServers` */
function isOpenCodeConfig(filePath: string): boolean {
  return filePath.includes('opencode');
}

export function getDefaultMcpConfigPaths(cwd: string = process.cwd()): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.codex', 'config.toml'),
    path.join(home, '.codex', 'mcp.json'),
    path.join(home, '.cursor', 'mcp.json'),
    path.join(home, '.claude.json'),
    path.join(home, '.gemini', 'settings.json'),
    path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
    path.join(home, '.config', 'opencode', 'opencode.json'),
    path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    path.join(cwd, '.cursor', 'mcp.json'),
    path.join(cwd, '.vscode', 'mcp.json'),
    path.join(cwd, '.opencode', 'opencode.json'),
    path.join(cwd, '.mcp.json'),
  ];
  return [...new Set(candidates)];
}

export function readTokenFromShellContent(content: string): string | null {
  const m = content.match(TOKEN_LINE_RE);
  return m?.[3] ?? null;
}

export function upsertShellToken(content: string, token: string, filePath?: string): string {
  if (filePath && isFishConfig(filePath)) {
    // Fish shell uses `set -gx` instead of `export`
    const fishLine = `set -gx ${PLAYWRIGHT_TOKEN_ENV} "${token}"`;
    const fishRe = /^\s*set\s+(-gx\s+)?PLAYWRIGHT_MCP_EXTENSION_TOKEN\s+.*/m;
    if (!content.trim()) return `${fishLine}\n`;
    if (fishRe.test(content)) return content.replace(fishRe, fishLine);
    return `${content.replace(/\s*$/, '')}\n${fishLine}\n`;
  }
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
  const opencode = parsed?.mcp?.[PLAYWRIGHT_SERVER_NAME]?.environment?.[PLAYWRIGHT_TOKEN_ENV];
  if (typeof opencode === 'string' && opencode) return opencode;
  return null;
}

export function upsertJsonConfigToken(content: string, token: string, filePath?: string): string {
  const parsed = content.trim() ? JSON.parse(content) : {};

  // Determine format: use OpenCode format only if explicitly an opencode config,
  // or if the existing content already uses `mcp` key (not `mcpServers`)
  const useOpenCodeFormat = filePath
    ? isOpenCodeConfig(filePath)
    : (!parsed.mcpServers && parsed.mcp);

  if (useOpenCodeFormat) {
    parsed.mcp = parsed.mcp ?? {};
    parsed.mcp[PLAYWRIGHT_SERVER_NAME] = parsed.mcp[PLAYWRIGHT_SERVER_NAME] ?? {
      command: ['npx', '-y', '@playwright/mcp@latest', '--extension'],
      enabled: true,
      type: 'local',
    };
    parsed.mcp[PLAYWRIGHT_SERVER_NAME].environment = parsed.mcp[PLAYWRIGHT_SERVER_NAME].environment ?? {};
    parsed.mcp[PLAYWRIGHT_SERVER_NAME].environment[PLAYWRIGHT_TOKEN_ENV] = token;
  } else {
    parsed.mcpServers = parsed.mcpServers ?? {};
    parsed.mcpServers[PLAYWRIGHT_SERVER_NAME] = parsed.mcpServers[PLAYWRIGHT_SERVER_NAME] ?? {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--extension'],
    };
    parsed.mcpServers[PLAYWRIGHT_SERVER_NAME].env = parsed.mcpServers[PLAYWRIGHT_SERVER_NAME].env ?? {};
    parsed.mcpServers[PLAYWRIGHT_SERVER_NAME].env[PLAYWRIGHT_TOKEN_ENV] = token;
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

export function fileExists(filePath: string): boolean {
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

/**
 * Dynamically enumerate Chrome profiles by scanning for 'Default' and 'Profile *'
 * directories across all browser base paths. Falls back to ['Default'] if none found.
 */
function enumerateProfiles(baseDirs: string[]): string[] {
  const profiles = new Set<string>();
  for (const base of baseDirs) {
    if (!fileExists(base)) continue;
    try {
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'Default' || /^Profile \d+$/.test(entry.name)) {
          profiles.add(entry.name);
        }
      }
    } catch { /* permission denied, etc. */ }
  }
  return profiles.size > 0 ? [...profiles].sort() : ['Default'];
}

/**
 * Discover the auth token stored by the Playwright MCP Bridge extension
 * by scanning Chrome's LevelDB localStorage files directly.
 *
 * Reads LevelDB .ldb/.log files as raw binary and searches for the
 * extension ID near base64url token values. This works reliably across
 * platforms because LevelDB's internal encoding can split ASCII strings
 * like "auth-token" and the extension ID across byte boundaries, making
 * text-based tools like `strings` + `grep` unreliable.
 */
export function discoverExtensionToken(): string | null {
  const home = os.homedir();
  const platform = os.platform();
  const bases: string[] = [];

  if (platform === 'darwin') {
    bases.push(
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome Dev'),
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome Beta'),
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome Canary'),
      path.join(home, 'Library', 'Application Support', 'Chromium'),
      path.join(home, 'Library', 'Application Support', 'Microsoft Edge'),
    );
  } else if (platform === 'linux') {
    bases.push(
      path.join(home, '.config', 'google-chrome'),
      path.join(home, '.config', 'google-chrome-unstable'),
      path.join(home, '.config', 'google-chrome-beta'),
      path.join(home, '.config', 'chromium'),
      path.join(home, '.config', 'microsoft-edge'),
    );
  } else if (platform === 'win32') {
    const appData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    bases.push(
      path.join(appData, 'Google', 'Chrome', 'User Data'),
      path.join(appData, 'Google', 'Chrome Dev', 'User Data'),
      path.join(appData, 'Google', 'Chrome Beta', 'User Data'),
      path.join(appData, 'Microsoft', 'Edge', 'User Data'),
    );
  }

  const profiles = enumerateProfiles(bases);
  const tokenRe = /([A-Za-z0-9_-]{40,50})/;

  for (const base of bases) {
    for (const profile of profiles) {
      const dir = path.join(base, profile, 'Local Storage', 'leveldb');
      if (!fileExists(dir)) continue;

      const token = extractTokenViaBinaryRead(dir, tokenRe);
      if (token) return token;
    }
  }

  return null;
}

function extractTokenViaBinaryRead(dir: string, tokenRe: RegExp): string | null {
  // LevelDB fragments strings across byte boundaries, so we can't search
  // for the full extension ID or "auth-token" as contiguous ASCII. Instead,
  // search for a short prefix of the extension ID that reliably appears as
  // contiguous bytes, then scan a window around each match for a base64url
  // token value.
  //
  // Observed LevelDB layout near the auth-token entry:
  //   ... auth-t<binary> ... 4,mmlmfjh<binary>Pocbjadbfplnigmagldckm.7 ...
  //   <binary> hqI86ncsD1QpcVcj-k9CyzTF-ieCQd_4KreZ_wy1WHA <binary> ...
  //
  // The extension ID prefix "mmlmfjh" appears ~44 bytes before the token.
  const extIdBuf = Buffer.from(PLAYWRIGHT_EXTENSION_ID);
  const extIdPrefix = Buffer.from(PLAYWRIGHT_EXTENSION_ID.slice(0, 7)); // "mmlmfjh"

  let files: string[];
  try {
    files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.ldb') || f.endsWith('.log'))
      .map(f => path.join(dir, f));
  } catch { return null; }

  // Sort by mtime descending so we find the freshest token first
  files.sort((a, b) => {
    try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
  });

  for (const file of files) {
    let data: Buffer;
    try { data = fs.readFileSync(file); } catch { continue; }

    // Quick check: file must contain at least the prefix
    if (data.indexOf(extIdPrefix) === -1) continue;

    // Strategy 1: scan after each occurrence of the extension ID prefix
    // for base64url tokens within a 500-byte window
    let idx = 0;
    while (true) {
      const pos = data.indexOf(extIdPrefix, idx);
      if (pos === -1) break;

      const scanStart = pos;
      const scanEnd = Math.min(data.length, pos + 500);
      const window = data.subarray(scanStart, scanEnd).toString('latin1');
      const m = window.match(tokenRe);
      if (m && validateBase64urlToken(m[1])) {
        // Make sure this isn't another extension ID that happens to match
        if (m[1] !== PLAYWRIGHT_EXTENSION_ID) return m[1];
      }
      idx = pos + 1;
    }

    // Strategy 2 (fallback): original approach using full extension ID + auth-token key
    const keyBuf = Buffer.from('auth-token');
    idx = 0;
    while (true) {
      const kp = data.indexOf(keyBuf, idx);
      if (kp === -1) break;

      const contextStart = Math.max(0, kp - 500);
      if (data.indexOf(extIdBuf, contextStart) !== -1 && data.indexOf(extIdBuf, contextStart) < kp) {
        const after = data.subarray(kp + keyBuf.length, kp + keyBuf.length + 200).toString('latin1');
        const m = after.match(tokenRe);
        if (m && validateBase64urlToken(m[1])) return m[1];
      }
      idx = kp + 1;
    }
  }
  return null;
}

function validateBase64urlToken(token: string): boolean {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(b64, 'base64');
    return decoded.length >= 28 && decoded.length <= 36;
  } catch { return false; }
}


/**
 * Check whether the Playwright MCP Bridge extension is installed in any browser.
 * Scans Chrome/Chromium/Edge Extensions directories for the known extension ID.
 */
export function checkExtensionInstalled(): { installed: boolean; browsers: string[] } {
  const home = os.homedir();
  const platform = os.platform();
  const browserDirs: Array<{ name: string; base: string }> = [];

  if (platform === 'darwin') {
    browserDirs.push(
      { name: 'Chrome', base: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome') },
      { name: 'Chrome Dev', base: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome Dev') },
      { name: 'Chrome Beta', base: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome Beta') },
      { name: 'Chrome Canary', base: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome Canary') },
      { name: 'Chromium', base: path.join(home, 'Library', 'Application Support', 'Chromium') },
      { name: 'Edge', base: path.join(home, 'Library', 'Application Support', 'Microsoft Edge') },
    );
  } else if (platform === 'linux') {
    browserDirs.push(
      { name: 'Chrome', base: path.join(home, '.config', 'google-chrome') },
      { name: 'Chrome Dev', base: path.join(home, '.config', 'google-chrome-unstable') },
      { name: 'Chrome Beta', base: path.join(home, '.config', 'google-chrome-beta') },
      { name: 'Chromium', base: path.join(home, '.config', 'chromium') },
      { name: 'Edge', base: path.join(home, '.config', 'microsoft-edge') },
    );
  } else if (platform === 'win32') {
    const appData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    browserDirs.push(
      { name: 'Chrome', base: path.join(appData, 'Google', 'Chrome', 'User Data') },
      { name: 'Chrome Dev', base: path.join(appData, 'Google', 'Chrome Dev', 'User Data') },
      { name: 'Chrome Beta', base: path.join(appData, 'Google', 'Chrome Beta', 'User Data') },
      { name: 'Edge', base: path.join(appData, 'Microsoft', 'Edge', 'User Data') },
    );
  }

  const profiles = enumerateProfiles(browserDirs.map(d => d.base));
  const foundBrowsers: string[] = [];

  for (const { name, base } of browserDirs) {
    for (const profile of profiles) {
      const extDir = path.join(base, profile, 'Extensions', PLAYWRIGHT_EXTENSION_ID);
      if (fileExists(extDir)) {
        foundBrowsers.push(name);
        break; // one match per browser is enough
      }
    }
  }

  return { installed: foundBrowsers.length > 0, browsers: [...new Set(foundBrowsers)] };
}

/**
 * Test token connectivity by attempting a real MCP connection.
 * Connects, does the JSON-RPC handshake, and immediately closes.
 */
export async function checkTokenConnectivity(opts?: { timeout?: number }): Promise<ConnectivityResult> {
  const timeout = opts?.timeout ?? 8;
  const start = Date.now();
  try {
    const mcp = new PlaywrightMCP();
    await mcp.connect({ timeout });
    await mcp.close();
    return { ok: true, durationMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), durationMs: Date.now() - start };
  }
}

export async function runBrowserDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const envToken = process.env[PLAYWRIGHT_TOKEN_ENV] ?? null;
  const shellPath = opts.shellRc ?? getDefaultShellRcPath();
  const shellFiles: ShellFileStatus[] = [shellPath].map((filePath) => {
    if (!fileExists(filePath)) return { path: filePath, exists: false, token: null, fingerprint: null };
    const content = fs.readFileSync(filePath, 'utf-8');
    const token = readTokenFromShellContent(content);
    return { path: filePath, exists: true, token, fingerprint: getTokenFingerprint(token ?? undefined) };
  });
  const configPaths = opts.configPaths?.length ? opts.configPaths : getDefaultMcpConfigPaths();
  const configs = configPaths.map(readConfigStatus);

  // Try to discover the token directly from the Chrome extension's localStorage
  const extensionToken = discoverExtensionToken();

  const allTokens = [
    opts.token ?? null,
    extensionToken,
    envToken,
    ...shellFiles.map(s => s.token),
    ...configs.map(c => c.token),
  ].filter((v): v is string => !!v);
  const uniqueTokens = [...new Set(allTokens)];
  const recommendedToken = opts.token ?? extensionToken ?? envToken ?? (uniqueTokens.length === 1 ? uniqueTokens[0] : null) ?? null;

  // Check extension installation
  const extInstall = checkExtensionInstalled();

  // Connectivity test (only when --live)
  let connectivity: ConnectivityResult | undefined;
  if (opts.live) {
    connectivity = await checkTokenConnectivity();
  }

  const report: DoctorReport = {
    cliVersion: opts.cliVersion,
    envToken,
    envFingerprint: getTokenFingerprint(envToken ?? undefined),
    extensionToken,
    extensionFingerprint: getTokenFingerprint(extensionToken ?? undefined),
    extensionInstalled: extInstall.installed,
    extensionBrowsers: extInstall.browsers,
    shellFiles,
    configs,
    recommendedToken,
    recommendedFingerprint: getTokenFingerprint(recommendedToken ?? undefined),
    connectivity,
    warnings: [],
    issues: [],
  };

  if (!extInstall.installed) report.issues.push('Playwright MCP Bridge extension is not installed in any browser.');
  if (!envToken) report.issues.push(`Current environment is missing ${PLAYWRIGHT_TOKEN_ENV}.`);
  if (!shellFiles.some(s => s.token)) report.issues.push('Shell startup file does not export PLAYWRIGHT_MCP_EXTENSION_TOKEN.');
  if (!configs.some(c => c.token)) report.issues.push('No scanned MCP config currently contains a Playwright extension token.');
  if (uniqueTokens.length > 1) report.issues.push('Detected inconsistent Playwright MCP tokens across env/config files.');
  if (connectivity && !connectivity.ok) report.issues.push(`Browser connectivity test failed: ${connectivity.error ?? 'unknown'}`);
  for (const config of configs) {
    if (config.parseError) report.warnings.push(`Could not parse ${config.path}: ${config.parseError}`);
  }
  if (!recommendedToken) {
    report.warnings.push('No token source found.');
  }
  return report;
}

export function renderBrowserDoctorReport(report: DoctorReport): string {
  const tokenFingerprints = [
    report.extensionFingerprint,
    report.envFingerprint,
    ...report.shellFiles.map(shell => shell.fingerprint),
    ...report.configs.filter(config => config.exists).map(config => config.fingerprint),
  ].filter((value): value is string => !!value);
  const uniqueFingerprints = [...new Set(tokenFingerprints)];
  const hasMismatch = uniqueFingerprints.length > 1;
  const lines = [chalk.bold(`opencli v${report.cliVersion ?? 'unknown'} doctor`), ''];

  // CDP endpoint mode (for remote/server environments)
  const { endpoint: cdpEndpoint, requestedCdp } = resolveCdpEndpoint();
  if (requestedCdp) {
    if (cdpEndpoint) {
      lines.push(statusLine('OK', `CDP endpoint: ${chalk.cyan(cdpEndpoint)}`));
    } else {
      lines.push(statusLine('MISSING', 'CDP endpoint (auto-discovery failed)'));
    }
    lines.push(chalk.dim('  → Remote Chrome mode: extension token not required'));
    lines.push('');
    return lines.join('\n');
  }

  const installStatus: ReportStatus = report.extensionInstalled ? 'OK' : 'MISSING';
  const installDetail = report.extensionInstalled
    ? `Extension installed (${report.extensionBrowsers.join(', ')})`
    : 'Extension not installed in any browser';
  lines.push(statusLine(installStatus, installDetail));

  const extStatus: ReportStatus = !report.extensionToken ? 'MISSING' : hasMismatch ? 'MISMATCH' : 'OK';
  lines.push(statusLine(extStatus, `Extension token (Chrome LevelDB): ${tokenSummary(report.extensionToken, report.extensionFingerprint)}`));

  const envStatus: ReportStatus = !report.envToken ? 'MISSING' : hasMismatch ? 'MISMATCH' : 'OK';
  lines.push(statusLine(envStatus, `Environment token: ${tokenSummary(report.envToken, report.envFingerprint)}`));

  for (const shell of report.shellFiles) {
    const shellStatus: ReportStatus = !shell.token ? 'MISSING' : hasMismatch ? 'MISMATCH' : 'OK';
    const tool = toolName(shell.path);
    const suffix = tool ? chalk.dim(` [${tool}]`) : '';
    lines.push(statusLine(shellStatus, `${shortenPath(shell.path)}${suffix}: ${tokenSummary(shell.token, shell.fingerprint)}`));
  }
  const existingConfigs = report.configs.filter(config => config.exists);
  const missingConfigCount = report.configs.length - existingConfigs.length;
  if (existingConfigs.length > 0) {
    for (const config of existingConfigs) {
      const parseSuffix = config.parseError ? chalk.red(` (parse error)`) : '';
      const configStatus: ReportStatus = config.parseError
        ? 'WARN'
        : !config.token
          ? 'MISSING'
          : hasMismatch
            ? 'MISMATCH'
            : 'OK';
      const tool = toolName(config.path);
      const suffix = tool ? chalk.dim(` [${tool}]`) : '';
      lines.push(statusLine(configStatus, `${shortenPath(config.path)}${suffix}: ${tokenSummary(config.token, config.fingerprint)}${parseSuffix}`));
    }
  } else {
    lines.push(statusLine('MISSING', 'MCP config: no existing config files found'));
  }
  if (missingConfigCount > 0) lines.push(chalk.dim(`     Other scanned config locations not present: ${missingConfigCount}`));
  lines.push('');

  // Connectivity result
  if (report.connectivity) {
    const connStatus: ReportStatus = report.connectivity.ok ? 'OK' : 'WARN';
    const connDetail = report.connectivity.ok
      ? `Browser connectivity: connected in ${(report.connectivity.durationMs / 1000).toFixed(1)}s`
      : `Browser connectivity: failed (${report.connectivity.error ?? 'unknown'})`;
    lines.push(statusLine(connStatus, connDetail));
  } else {
    lines.push(statusLine('WARN', 'Browser connectivity: not tested (use --live)'));
  }

  lines.push(statusLine(
    hasMismatch ? 'MISMATCH' : report.recommendedToken ? 'OK' : 'WARN',
    `Recommended token fingerprint: ${report.recommendedFingerprint ?? 'unavailable'}`,
  ));
  if (report.issues.length) {
    lines.push('', chalk.yellow('Issues:'));
    for (const issue of report.issues) lines.push(chalk.dim(`  • ${issue}`));
  }
  if (report.warnings.length) {
    lines.push('', chalk.yellow('Warnings:'));
    for (const warning of report.warnings) lines.push(chalk.dim(`  • ${warning}`));
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

export function writeFileWithMkdir(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export async function applyBrowserDoctorFix(report: DoctorReport, opts: DoctorOptions = {}): Promise<string[]> {
  const token = opts.token ?? report.recommendedToken;
  if (!token) throw new Error('No Playwright MCP token is available to write. Provide --token first.');
  const fp = getTokenFingerprint(token);

  const plannedWrites: string[] = [];
  const shellPath = opts.shellRc ?? report.shellFiles[0]?.path ?? getDefaultShellRcPath();
  const shellStatus = report.shellFiles.find(s => s.path === shellPath);
  if (shellStatus?.fingerprint !== fp) plannedWrites.push(shellPath);
  for (const config of report.configs) {
    if (!config.writable) continue;
    if (config.fingerprint === fp) continue; // already correct
    plannedWrites.push(config.path);
  }

  if (plannedWrites.length === 0) {
    console.log(chalk.green('All config files are already up to date.'));
    return [];
  }

  if (!opts.yes) {
    const ok = await confirmPrompt(`Update ${plannedWrites.length} file(s) with Playwright MCP token fingerprint ${fp}?`);
    if (!ok) return [];
  }

  const written: string[] = [];
  if (plannedWrites.includes(shellPath)) {
    const shellBefore = fileExists(shellPath) ? fs.readFileSync(shellPath, 'utf-8') : '';
    writeFileWithMkdir(shellPath, upsertShellToken(shellBefore, token, shellPath));
    written.push(shellPath);
  }

  for (const config of report.configs) {
    if (!plannedWrites.includes(config.path)) continue;
    if (config.parseError) continue;
    const before = fileExists(config.path) ? fs.readFileSync(config.path, 'utf-8') : '';
    const next = config.format === 'toml'
      ? upsertTomlConfigToken(before, token)
      : upsertJsonConfigToken(before, token, config.path);
    writeFileWithMkdir(config.path, next);
    written.push(config.path);
  }

  process.env[PLAYWRIGHT_TOKEN_ENV] = token;
  return written;
}
