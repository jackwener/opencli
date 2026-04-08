import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHomedir } = vi.hoisted(() => ({
  mockHomedir: vi.fn(() => '/tmp'),
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: mockHomedir,
  };
});

import { getInstalledInfo, removeVersionEntry, upsertInstallEntry } from './external-store.js';
import type { InstalledExternalCli } from './external.js';

describe('external-store', () => {
  beforeEach(() => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-external-store-test-'));
    mockHomedir.mockReturnValue(tempHome);
  });

  afterEach(() => {
    fs.rmSync(mockHomedir(), { recursive: true, force: true });
  });

  it('promotes the most recently installed version when removing the current version', () => {
    const info: InstalledExternalCli = {
      name: 'vercel',
      binaryName: 'vercel',
      installType: 'isolated',
      versions: [
        {
          version: '42.0.0',
          installPath: '/tmp/vercel/42.0.0',
          installedAt: '2026-03-01T00:00:00.000Z',
          current: false,
        },
        {
          version: '43.1.0',
          installPath: '/tmp/vercel/43.1.0',
          installedAt: '2026-03-10T00:00:00.000Z',
          current: true,
        },
      ],
    };

    expect(upsertInstallEntry(info)).toBe(true);
    expect(removeVersionEntry('vercel', '43.1.0')).toBe(true);

    const saved = getInstalledInfo('vercel');
    expect(saved?.versions).toHaveLength(1);
    expect(saved?.versions[0].version).toBe('42.0.0');
    expect(saved?.versions[0].current).toBe(true);
  });
});
