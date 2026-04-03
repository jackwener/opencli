import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export interface BrowserCandidate {
  id: 'chrome' | 'edge' | 'chromium';
  name: string;
  running: boolean;
  /**
   * macOS: app bundle path (e.g. /Applications/Google Chrome.app)
   * Linux/Windows: executable path
   */
  executable: string;
}

function trimPath(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function tryWhich(bin: string): string | null {
  try {
    const out = execFileSync('which', [bin], { encoding: 'utf-8', stdio: 'pipe' });
    const firstLine = String(out).split('\n')[0] ?? '';
    const resolved = firstLine.trim();
    return resolved ? resolved : null;
  } catch {
    return null;
  }
}

function tryDiscoverMacApp(displayName: string): string | null {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('osascript', [
      '-e',
      `POSIX path of (path to application "${displayName}")`,
    ], { encoding: 'utf-8', stdio: 'pipe', timeout: 5_000 });
    const resolved = trimPath(String(out));
    return resolved ? resolved : null;
  } catch {
    return null;
  }
}

function winPathsFromEnv(parts: string[]): string[] {
  const result: string[] = [];
  const pf = process.env.ProgramFiles;
  const pfx86 = process.env['ProgramFiles(x86)'];
  const local = process.env.LOCALAPPDATA;

  const bases = [
    pf,
    pfx86,
    local,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);

  for (const base of bases) {
    result.push(path.win32.join(base, ...parts));
  }
  return result;
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // ignore invalid path inputs
    }
  }
  return null;
}

function isRunningUnix(processNames: string[]): boolean {
  for (const processName of processNames) {
    try {
      execFileSync('pgrep', ['-x', processName], { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      // try next process name
    }
  }
  return false;
}

function isRunningWindows(imageNames: string[]): boolean {
  for (const imageName of imageNames) {
    try {
      const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${imageName}`], { encoding: 'utf-8', stdio: 'pipe' });
      if (String(out).includes(imageName)) return true;
    } catch {
      // try next image name
    }
  }
  return false;
}

function isBrowserRunning(processNames: string[]): boolean {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return isRunningUnix(processNames);
  }
  if (process.platform === 'win32') {
    return isRunningWindows(processNames);
  }
  return false;
}

export function getBrowserCandidates(): BrowserCandidate[] {
  const installed: BrowserCandidate[] = [];

  const defs: Array<{
    id: BrowserCandidate['id'];
    name: string;
    macAppName: string;
    linuxBins: string[];
    winExeParts: string[][];
    processNames: string[];
  }> = [
    {
      id: 'chrome',
      name: 'Chrome',
      macAppName: 'Google Chrome',
      linuxBins: ['google-chrome-stable', 'google-chrome'],
      winExeParts: [
        ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ],
      processNames: ['Google Chrome', 'google-chrome-stable', 'google-chrome', 'chrome', 'chrome.exe'],
    },
    {
      id: 'edge',
      name: 'Edge',
      macAppName: 'Microsoft Edge',
      linuxBins: ['microsoft-edge-stable', 'microsoft-edge'],
      winExeParts: [
        ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
      ],
      processNames: ['Microsoft Edge', 'microsoft-edge-stable', 'microsoft-edge', 'msedge', 'msedge.exe'],
    },
    {
      id: 'chromium',
      name: 'Chromium',
      macAppName: 'Chromium',
      linuxBins: ['chromium', 'chromium-browser'],
      winExeParts: [
        ['Chromium', 'Application', 'chrome.exe'],
      ],
      processNames: ['Chromium', 'chromium', 'chromium-browser', 'chrome.exe'],
    },
  ];

  for (const def of defs) {
    let executable: string | null = null;

    if (process.platform === 'darwin') {
      executable = tryDiscoverMacApp(def.macAppName);
    } else if (process.platform === 'linux') {
      for (const bin of def.linuxBins) {
        executable = tryWhich(bin);
        if (executable) break;
      }
    } else if (process.platform === 'win32') {
      const candidates: string[] = [];
      for (const parts of def.winExeParts) {
        candidates.push(...winPathsFromEnv(parts));
      }
      executable = firstExisting(candidates);
    }

    if (executable) {
      installed.push({
        id: def.id,
        name: def.name,
        executable: trimPath(executable),
        running: isBrowserRunning(def.processNames),
      });
    }
  }

  return [
    ...installed.filter(candidate => candidate.running),
    ...installed.filter(candidate => !candidate.running),
  ];
}

export async function launchBrowserCandidate(candidate: BrowserCandidate): Promise<void> {
  const opts = { detached: true as const, stdio: 'ignore' as const, env: { ...process.env } };

  if (process.platform === 'darwin') {
    const child = spawn('open', [candidate.executable], opts);
    child.unref();
    return;
  }

  const child = spawn(candidate.executable, [], opts);
  child.unref();
}
