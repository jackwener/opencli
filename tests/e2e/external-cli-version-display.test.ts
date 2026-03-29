/**
 * E2E tests for external CLI version display in `opencli list`.
 *
 * Validates that `opencli list` shows version info and installation type
 * for external CLIs, and that version detection/caching works correctly.
 *
 * Uses a temp HOME directory to isolate from the real ~/.opencli.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runCli, parseJsonOutput } from './helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TEMP_HOME = path.join(os.tmpdir(), `opencli-e2e-ver-${Date.now()}`);

function envWithHome(): Record<string, string> {
  return { HOME: TEMP_HOME, USERPROFILE: TEMP_HOME };
}

function readLockFile(): Record<string, any> {
  const lockPath = path.join(TEMP_HOME, '.opencli', 'external.lock.json');
  if (!fs.existsSync(lockPath)) return {};
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

describe('external CLI version display E2E', () => {
  beforeAll(async () => {
    fs.mkdirSync(TEMP_HOME, { recursive: true });

    // Register and install cowsay in isolated mode for version tests
    await runCli(
      ['register', 'cowsay', '--binary', 'cowsay', '--install', 'npm install -g cowsay', '--desc', 'ASCII art cow'],
      { env: envWithHome(), timeout: 15_000 },
    );
    await runCli(
      ['install', 'cowsay', '--isolated', '--version', '1.5.0'],
      { env: envWithHome(), timeout: 60_000 },
    );
  }, 90_000);

  afterAll(() => {
    try {
      fs.rmSync(TEMP_HOME, { recursive: true, force: true });
    } catch {}
  });

  // ── list table format with version info ──
  it('list table format shows external CLIs section', async () => {
    const { stdout, code } = await runCli(
      ['list'],
      { env: envWithHome(), timeout: 30_000 },
    );
    expect(code).toBe(0);
    // Should have external CLIs section
    expect(stdout).toContain('external CLIs');
  });

  it('list table format shows version for isolated install', async () => {
    const { stdout, code } = await runCli(
      ['list'],
      { env: envWithHome(), timeout: 30_000 },
    );
    expect(code).toBe(0);
    // cowsay should appear with version and isolated marker
    expect(stdout).toContain('cowsay');
    // Should show the version number
    expect(stdout).toContain('1.5.0');
    // Should show installation type
    expect(stdout).toContain('isolated');
  });

  // ── list JSON format with version info ──
  it('list -f json includes version and installType for external CLIs', async () => {
    const { stdout, code } = await runCli(
      ['list', '-f', 'json'],
      { env: envWithHome(), timeout: 30_000 },
    );
    expect(code).toBe(0);
    const data = parseJsonOutput(stdout);
    expect(Array.isArray(data)).toBe(true);

    // Find the cowsay entry
    const cowsayEntry = data.find((e: any) => e.command === 'cowsay');
    expect(cowsayEntry).toBeDefined();
    expect(cowsayEntry.version).toBe('1.5.0');
    expect(cowsayEntry.installType).toBe('isolated');
    expect(cowsayEntry.installed).toBe(true);
  });

  // ── list YAML format includes external CLIs ──
  it('list -f yaml includes external CLI entries', async () => {
    const { stdout, code } = await runCli(
      ['list', '-f', 'yaml'],
      { env: envWithHome(), timeout: 30_000 },
    );
    expect(code).toBe(0);
    expect(stdout).toContain('cowsay');
    expect(stdout).toContain('1.5.0');
  });

  // ── version caching in lock file ──
  it('lock file stores version info for isolated installs', async () => {
    const lock = readLockFile();
    expect(lock['cowsay']).toBeDefined();
    expect(lock['cowsay'].installType).toBe('isolated');
    const currentVersion = lock['cowsay'].versions.find((v: any) => v.current);
    expect(currentVersion).toBeDefined();
    expect(currentVersion.version).toBe('1.5.0');
  });

  // ── list shows non-installed external CLIs with auto-install tag ──
  it('list shows non-installed external CLIs', async () => {
    const { stdout, code } = await runCli(
      ['list'],
      { env: envWithHome(), timeout: 30_000 },
    );
    expect(code).toBe(0);
    // Built-in external CLIs that aren't installed should still appear
    // (they'll show auto-install or installed depending on global availability)
    expect(stdout).toContain('external CLIs');
  });
});
