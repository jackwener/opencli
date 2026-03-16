/**
 * MCP server path discovery and argument building.
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let _cachedMcpServerPath: string | null | undefined;
let _existsSync = fs.existsSync;
let _execSync = execSync;

export function resetMcpServerPathCache(): void {
  _cachedMcpServerPath = undefined;
}

export function setMcpDiscoveryTestHooks(input?: {
  existsSync?: typeof fs.existsSync;
  execSync?: typeof execSync;
}): void {
  _existsSync = input?.existsSync ?? fs.existsSync;
  _execSync = input?.execSync ?? execSync;
}

export function findMcpServerPath(): string | null {
  if (_cachedMcpServerPath !== undefined) return _cachedMcpServerPath;

  const envMcp = process.env.OPENCLI_MCP_SERVER_PATH;
  if (envMcp && _existsSync(envMcp)) {
    _cachedMcpServerPath = envMcp;
    return _cachedMcpServerPath;
  }

  // Check local node_modules first (@playwright/mcp is the modern package)
  const localMcp = path.resolve('node_modules', '@playwright', 'mcp', 'cli.js');
  if (_existsSync(localMcp)) {
    _cachedMcpServerPath = localMcp;
    return _cachedMcpServerPath;
  }

  // Check project-relative path
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const projectMcp = path.resolve(__dirname2, '..', '..', 'node_modules', '@playwright', 'mcp', 'cli.js');
  if (_existsSync(projectMcp)) {
    _cachedMcpServerPath = projectMcp;
    return _cachedMcpServerPath;
  }

  // Check global npm/yarn locations derived from current Node runtime.
  const nodePrefix = path.resolve(path.dirname(process.execPath), '..');
  const globalNodeModules = path.join(nodePrefix, 'lib', 'node_modules');
  const globalMcp = path.join(globalNodeModules, '@playwright', 'mcp', 'cli.js');
  if (_existsSync(globalMcp)) {
    _cachedMcpServerPath = globalMcp;
    return _cachedMcpServerPath;
  }

  // Check npm global root directly.
  try {
    const npmRootGlobal = _execSync('npm root -g 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const npmGlobalMcp = path.join(npmRootGlobal, '@playwright', 'mcp', 'cli.js');
    if (npmRootGlobal && _existsSync(npmGlobalMcp)) {
      _cachedMcpServerPath = npmGlobalMcp;
      return _cachedMcpServerPath;
    }
  } catch {}

  // Check common locations
  const candidates = [
    path.join(os.homedir(), '.npm', '_npx'),
    path.join(os.homedir(), 'node_modules', '.bin'),
    '/usr/local/lib/node_modules',
  ];

  // Try npx resolution (legacy package name)
  try {
    const result = _execSync('npx -y --package=@playwright/mcp which mcp-server-playwright 2>/dev/null', { encoding: 'utf-8', timeout: 10000 }).trim();
    if (result && _existsSync(result)) {
      _cachedMcpServerPath = result;
      return _cachedMcpServerPath;
    }
  } catch {}

  // Try which
  try {
    const result = _execSync('which mcp-server-playwright 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && _existsSync(result)) {
      _cachedMcpServerPath = result;
      return _cachedMcpServerPath;
    }
  } catch {}

  // Search in common npx cache
  for (const base of candidates) {
    if (!_existsSync(base)) continue;
    try {
      const found = _execSync(`find "${base}" -name "cli.js" -path "*playwright*mcp*" 2>/dev/null | head -1`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (found) {
        _cachedMcpServerPath = found;
        return _cachedMcpServerPath;
      }
    } catch {}
  }

  _cachedMcpServerPath = null;
  return _cachedMcpServerPath;
}

/**
 * Chrome 144+ auto-discovery: read DevToolsActivePort file to get CDP endpoint.
 *
 * Starting with Chrome 144, users can enable remote debugging from
 * chrome://inspect#remote-debugging without any command-line flags.
 * Chrome writes the active port and browser GUID to a DevToolsActivePort file
 * in the user data directory, which we read to construct the WebSocket endpoint.
 */
export function discoverChromeEndpoint(): string | null {
  const candidates: string[] = [];

  // User-specified Chrome data dir takes highest priority
  if (process.env.CHROME_USER_DATA_DIR) {
    candidates.push(path.join(process.env.CHROME_USER_DATA_DIR, 'DevToolsActivePort'));
  }

  // Standard Chrome/Edge user data dirs per platform
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'DevToolsActivePort'));
    candidates.push(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'DevToolsActivePort'));
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'DevToolsActivePort'));
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'DevToolsActivePort'));
  } else {
    candidates.push(path.join(os.homedir(), '.config', 'google-chrome', 'DevToolsActivePort'));
    candidates.push(path.join(os.homedir(), '.config', 'chromium', 'DevToolsActivePort'));
    candidates.push(path.join(os.homedir(), '.config', 'microsoft-edge', 'DevToolsActivePort'));
  }

  for (const filePath of candidates) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      const lines = content.split('\n');
      if (lines.length >= 2) {
        const port = parseInt(lines[0], 10);
        const browserPath = lines[1]; // e.g. /devtools/browser/<GUID>
        if (port > 0 && browserPath.startsWith('/devtools/browser/')) {
          return `ws://127.0.0.1:${port}${browserPath}`;
        }
      }
    } catch {}
  }
  return null;
}

export function resolveCdpEndpoint(): { endpoint?: string; requestedCdp: boolean } {
  const envVal = process.env.OPENCLI_CDP_ENDPOINT;
  if (envVal === '1' || envVal?.toLowerCase() === 'true') {
    const autoDiscovered = discoverChromeEndpoint();
    return { endpoint: autoDiscovered ?? envVal, requestedCdp: true };
  }

  if (envVal) {
    return { endpoint: envVal, requestedCdp: true };
  }

  // Fallback to auto-discovery if not explicitly set
  const autoDiscovered = discoverChromeEndpoint();
  if (autoDiscovered) {
    return { endpoint: autoDiscovered, requestedCdp: true };
  }

  return { requestedCdp: false };
}

function buildRuntimeArgs(input?: { executablePath?: string | null; cdpEndpoint?: string }): string[] {
  const args: string[] = [];

  // Priority 1: CDP endpoint (remote Chrome debugging or local Auto-Discovery)
  if (input?.cdpEndpoint) {
    args.push('--cdp-endpoint', input.cdpEndpoint);
    return args;
  }

  // Priority 2: Extension mode (local Chrome with MCP Bridge extension)
  if (!process.env.CI) {
    args.push('--extension');
  }

  // CI/standalone mode: @playwright/mcp launches its own browser (headed by default).
  // xvfb provides a virtual display for headed mode in GitHub Actions.
  if (input?.executablePath) {
    args.push('--executable-path', input.executablePath);
  }
  return args;
}

export function buildMcpArgs(input: { mcpPath: string; executablePath?: string | null; cdpEndpoint?: string }): string[] {
  return [input.mcpPath, ...buildRuntimeArgs(input)];
}

export function buildMcpLaunchSpec(input: { mcpPath?: string | null; executablePath?: string | null; cdpEndpoint?: string }): {
  command: string;
  args: string[];
  usedNpxFallback: boolean;
} {
  const runtimeArgs = buildRuntimeArgs(input);
  if (input.mcpPath) {
    return {
      command: 'node',
      args: [input.mcpPath, ...runtimeArgs],
      usedNpxFallback: false,
    };
  }

  return {
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest', ...runtimeArgs],
    usedNpxFallback: true,
  };
}
