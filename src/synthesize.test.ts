import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockExistsSync, mockGetUserExploreDir } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(candidate: string) => boolean>(),
  mockGetUserExploreDir: vi.fn((site: string) => `/mock-home/.opencli/explore/${site}`),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: mockExistsSync,
  };
});

vi.mock('./user-opencli-paths.js', async () => {
  const actual = await vi.importActual<typeof import('./user-opencli-paths.js')>('./user-opencli-paths.js');
  return {
    ...actual,
    getUserExploreDir: mockGetUserExploreDir,
  };
});

import { resolveExploreDir } from './synthesize.js';

describe('resolveExploreDir', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the explicit target path when it already exists', () => {
    mockExistsSync.mockImplementation((candidate) => candidate === '/tmp/explore-dir');

    expect(resolveExploreDir('/tmp/explore-dir')).toBe('/tmp/explore-dir');
    expect(mockExistsSync).toHaveBeenCalledWith('/tmp/explore-dir');
  });

  it('prefers ~/.opencli explore artifacts before the legacy cwd fallback', () => {
    const target = 'mysite';
    const homeCandidate = `/mock-home/.opencli/explore/${target}`;
    const cwdCandidate = path.join('.opencli', 'explore', target);
    mockExistsSync.mockImplementation((candidate) => candidate === homeCandidate || candidate === cwdCandidate);

    expect(resolveExploreDir(target)).toBe(homeCandidate);
    expect(mockGetUserExploreDir).toHaveBeenCalledWith(target);
  });

  it('falls back to the legacy cwd artifact path when the home artifact is missing', () => {
    const target = 'mysite';
    const cwdCandidate = path.join('.opencli', 'explore', target);
    mockExistsSync.mockImplementation((candidate) => candidate === cwdCandidate);

    expect(resolveExploreDir(target)).toBe(cwdCandidate);
  });

  it('shows the improved error hint when no explore artifact exists', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => resolveExploreDir('missing-site')).toThrowError(
      'Explore directory not found: missing-site. If artifacts were created elsewhere, pass the full path.',
    );
  });
});
