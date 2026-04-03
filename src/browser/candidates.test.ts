import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const { mockExistsSync, mockExecFileSync, mockSpawn } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
  spawn: mockSpawn,
}));

function setPlatform(platform: NodeJS.Platform): () => void {
  const desc = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => {
    if (desc) Object.defineProperty(process, 'platform', desc);
  };
}

function setEnv(key: string, value: string): () => void {
  const prev = process.env[key];
  process.env[key] = value;
  return () => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  };
}

describe('browser candidates', () => {
  let restorePlatform = () => {};
  let restoreEnv: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restorePlatform();
    for (const restore of restoreEnv) restore();
    restoreEnv = [];
  });

  it('returns linux candidates in Chrome -> Edge -> Chromium order', async () => {
    restorePlatform = setPlatform('linux');

    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      const bin = cmd === 'pgrep' ? args[1] : args[0];
      if (cmd === 'which') {
        if (bin === 'google-chrome-stable') return '/usr/bin/google-chrome-stable\n';
        if (bin === 'microsoft-edge-stable') return '/usr/bin/microsoft-edge-stable\n';
        if (bin === 'chromium') return '/usr/bin/chromium\n';
        throw new Error('not found');
      }
      if (cmd === 'pgrep') throw new Error('not running');
      throw new Error(`unexpected cmd: ${cmd}`);
    });

    const { getBrowserCandidates } = await import('./candidates.js');
    const candidates = getBrowserCandidates();

    expect(candidates.map((c) => c.id)).toEqual(['chrome', 'edge', 'chromium']);
    expect(candidates.map((c) => c.executable)).toEqual([
      '/usr/bin/google-chrome-stable',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/chromium',
    ]);
  });

  it('prioritizes running browsers while preserving brand order', async () => {
    restorePlatform = setPlatform('linux');

    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      const bin = cmd === 'pgrep' ? args[1] : args[0];
      if (cmd === 'which') {
        if (bin === 'google-chrome-stable') return '/usr/bin/google-chrome-stable\n';
        if (bin === 'microsoft-edge-stable') return '/usr/bin/microsoft-edge-stable\n';
        if (bin === 'chromium') return '/usr/bin/chromium\n';
        throw new Error('not found');
      }
      if (cmd === 'pgrep') {
        if (bin === 'microsoft-edge-stable') return '123\n';
        throw new Error('not running');
      }
      throw new Error('not found');
    });

    const { getBrowserCandidates } = await import('./candidates.js');
    const candidates = getBrowserCandidates();

    expect(candidates.map((c) => c.id)).toEqual(['edge', 'chrome', 'chromium']);
    expect(candidates.map((c) => c.running)).toEqual([true, false, false]);
  });

  it('skips browsers that are not installed (windows path probe)', async () => {
    restorePlatform = setPlatform('win32');

    restoreEnv.push(setEnv('ProgramFiles', 'C:\\Program Files'));
    restoreEnv.push(setEnv('ProgramFiles(x86)', 'C:\\Program Files (x86)'));
    restoreEnv.push(setEnv('LOCALAPPDATA', 'C:\\Users\\oops\\AppData\\Local'));

    mockExistsSync.mockImplementation((file: string) => file.replace(/\\/g, '/').endsWith('/Microsoft/Edge/Application/msedge.exe'));

    const { getBrowserCandidates } = await import('./candidates.js');
    const candidates = getBrowserCandidates();

    expect(candidates.map((c) => c.id)).toEqual(['edge']);
  });

  it('returns macOS app candidates in order when apps are discoverable', async () => {
    restorePlatform = setPlatform('darwin');

    mockExecFileSync.mockImplementation((cmd: string, args: string[], opts: any) => {
      expect(cmd).toBe('osascript');
      expect(opts?.encoding).toBe('utf-8');
      const script = String(args[1] ?? '');
      if (script.includes('Google Chrome')) return '/Applications/Google Chrome.app/\n';
      if (script.includes('Microsoft Edge')) return '/Applications/Microsoft Edge.app/\n';
      if (script.includes('Chromium')) return '/Applications/Chromium.app/\n';
      throw new Error('app not found');
    });

    const { getBrowserCandidates } = await import('./candidates.js');
    const candidates = getBrowserCandidates();

    expect(candidates.map((c) => c.id)).toEqual(['chrome', 'edge', 'chromium']);
    expect(candidates[0]?.executable).toBe('/Applications/Google Chrome.app');
  });

  it('launches a detected candidate (linux)', async () => {
    restorePlatform = setPlatform('linux');
    mockSpawn.mockReturnValue({ unref: vi.fn() });

    const { launchBrowserCandidate } = await import('./candidates.js');
    await launchBrowserCandidate({ id: 'edge', name: 'Edge', executable: '/usr/bin/microsoft-edge-stable', running: false });

    expect(mockSpawn).toHaveBeenCalledWith(
      '/usr/bin/microsoft-edge-stable',
      [],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });

  it('launches a detected candidate on macOS via app bundle path', async () => {
    restorePlatform = setPlatform('darwin');
    mockSpawn.mockReturnValue({ unref: vi.fn() });

    const { launchBrowserCandidate } = await import('./candidates.js');
    await launchBrowserCandidate({ id: 'edge', name: 'Edge', executable: '/Applications/Microsoft Edge.app', running: false });

    expect(mockSpawn).toHaveBeenCalledWith(
      'open',
      ['/Applications/Microsoft Edge.app'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });
});
