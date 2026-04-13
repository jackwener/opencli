import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const CACHE_FILE = path.join(os.homedir(), '.opencli', 'workspace-tabs.json');

type WorkspaceTabState = Record<string, number>;

function readCache(): WorkspaceTabState {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as WorkspaceTabState;
  } catch {
    return {};
  }
}

function writeCache(cache: WorkspaceTabState): void {
  const cacheDir = path.dirname(CACHE_FILE);
  const tempFile = path.join(cacheDir, `workspace-tabs.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  fs.renameSync(tempFile, CACHE_FILE);
}

export function loadWorkspaceTabId(workspace: string): number | undefined {
  const tabId = readCache()[workspace];
  return typeof tabId === 'number' ? tabId : undefined;
}

export function saveWorkspaceTabId(workspace: string, tabId: number): void {
  const cache = readCache();
  cache[workspace] = tabId;
  writeCache(cache);
}

export function clearWorkspaceTabId(workspace: string): void {
  const cache = readCache();
  if (!(workspace in cache)) return;
  delete cache[workspace];
  writeCache(cache);
}
