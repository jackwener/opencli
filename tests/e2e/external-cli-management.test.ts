/**
 * E2E tests for external CLI isolated installation, version management,
 * uninstall, and switch commands.
 *
 * Uses a temp HOME directory to isolate from the real ~/.opencli.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runCli } from './helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TEMP_HOME = path.join(os.tmpdir(), `opencli-e2e-ext-${Date.now()}`);

function envWithHome(): Record<string, string> {
  return { HOME: TEMP_HOME, USERPROFILE: TEMP_HOME };
}

function readLockFile(): Record<string, any> {
  const lockPath = path.join(TEMP_HOME, '.opencli', 'external.lock.json');
  if (!fs.existsSync(lockPath)) return {};
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

describe('external CLI management E2E', () => {
  beforeAll(() => {
    fs.mkdirSync(TEMP_HOME, { recursive: true });
  });

  afterAll(() => {
    // Clean up temp home
    try {
      fs.rmSync(TEMP_HOME, { recursive: true, force: true });
    } catch {}
  });

  // ── register ──
  it('register adds a CLI to user registry', async () => {
    const { stdout, code } = await runCli(
      ['register', 'cowsay', '--binary', 'cowsay', '--install', 'npm install -g cowsay', '--desc', 'ASCII art cow'],
      { env: envWithHome(), timeout: 15_000 },
    );
    expect(code).toBe(0);
    expect(stdout).toContain('Registered');

    // Verify user registry file was created
    const registryPath = path.join(TEMP_HOME, '.opencli', 'external-clis.yaml');
    expect(fs.existsSync(registryPath)).toBe(true);
    const content = fs.readFileSync(registryPath, 'utf8');
    expect(content).toContain('cowsay');
  });

  // ── install --isolated ──
  it('install --isolated installs a CLI to isolated directory', async () => {
    const { stdout, code } = await runCli(
      ['install', 'cowsay', '--isolated'],
      { env: envWithHome(), timeout: 60_000 },
    );
    expect(code).toBe(0);
    expect(stdout).toContain('isolated');

    // Verify lock file was created
    const lock = readLockFile();
    expect(lock['cowsay']).toBeDefined();
    expect(lock['cowsay'].installType).toBe('isolated');
    expect(lock['cowsay'].versions.length).toBeGreaterThanOrEqual(1);

    // Verify install directory exists
    const optRoot = path.join(TEMP_HOME, '.opencli', 'opt');
    expect(fs.existsSync(optRoot)).toBe(true);
    const cowsayDir = path.join(optRoot, 'cowsay');
    expect(fs.existsSync(cowsayDir)).toBe(true);
  }, 90_000);

  // ── install --isolated --version ──
  it('install --isolated --version installs a specific version', async () => {
    const { stdout, code } = await runCli(
      ['install', 'cowsay', '--isolated', '--version', '1.5.0'],
      { env: envWithHome(), timeout: 60_000 },
    );
    expect(code).toBe(0);

    // Verify version directory
    const versionDir = path.join(TEMP_HOME, '.opencli', 'opt', 'cowsay', '1.5.0');
    expect(fs.existsSync(versionDir)).toBe(true);

    // Verify lock file has the version
    const lock = readLockFile();
    const versions = lock['cowsay'].versions.map((v: any) => v.version);
    expect(versions).toContain('1.5.0');
  }, 90_000);

  // ── switch ──
  it('switch changes the active version', async () => {
    // First get the current versions from lock file
    const lockBefore = readLockFile();
    const versions = lockBefore['cowsay'].versions;
    expect(versions.length).toBeGreaterThanOrEqual(2);

    // Find a non-current version to switch to
    const currentVer = versions.find((v: any) => v.current)?.version;
    const otherVer = versions.find((v: any) => !v.current)?.version;
    expect(otherVer).toBeDefined();

    const { stdout, code } = await runCli(
      ['switch', 'cowsay', otherVer!],
      { env: envWithHome(), timeout: 15_000 },
    );
    expect(code).toBe(0);
    expect(stdout).toContain('Switched');

    // Verify lock file was updated
    const lockAfter = readLockFile();
    const currentAfter = lockAfter['cowsay'].versions.find((v: any) => v.current);
    expect(currentAfter.version).toBe(otherVer);
  });

  // ── switch error: non-existent version ──
  it('switch fails for non-installed version', async () => {
    const { stderr, code } = await runCli(
      ['switch', 'cowsay', '99.99.99'],
      { env: envWithHome(), timeout: 15_000 },
    );
    expect(code).toBe(1);
  });

  // ── uninstall --version ──
  it('uninstall --version removes a specific version', async () => {
    const { stdout, code } = await runCli(
      ['uninstall', 'cowsay', '--version', '1.5.0'],
      { env: envWithHome(), timeout: 15_000 },
    );
    expect(code).toBe(0);
    expect(stdout).toContain('Uninstalled');

    // Verify version directory was removed
    const versionDir = path.join(TEMP_HOME, '.opencli', 'opt', 'cowsay', '1.5.0');
    expect(fs.existsSync(versionDir)).toBe(false);

    // Verify lock file was updated
    const lock = readLockFile();
    if (lock['cowsay']) {
      const versions = lock['cowsay'].versions.map((v: any) => v.version);
      expect(versions).not.toContain('1.5.0');
    }
  });

  // ── uninstall all ──
  it('uninstall removes all versions of a CLI', async () => {
    const { stdout, code } = await runCli(
      ['uninstall', 'cowsay'],
      { env: envWithHome(), timeout: 15_000 },
    );
    expect(code).toBe(0);
    expect(stdout).toContain('Uninstalled');

    // Verify entire CLI directory was removed
    const cliDir = path.join(TEMP_HOME, '.opencli', 'opt', 'cowsay');
    expect(fs.existsSync(cliDir)).toBe(false);

    // Verify lock file was cleaned
    const lock = readLockFile();
    expect(lock['cowsay']).toBeUndefined();
  });

  // ── uninstall error: not installed ──
  it('uninstall fails for non-installed CLI', async () => {
    const { stderr, code } = await runCli(
      ['uninstall', 'nonexistent-cli-xyz'],
      { env: envWithHome(), timeout: 15_000 },
    );
    expect(code).toBe(1);
  });

  // ── switch error: not installed ──
  it('switch fails for non-installed CLI', async () => {
    const { stderr, code } = await runCli(
      ['switch', 'nonexistent-cli-xyz', '1.0.0'],
      { env: envWithHome(), timeout: 15_000 },
    );
    expect(code).toBe(1);
  });
});
