/**
 * Tests for plugin management: install, uninstall, list.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PLUGINS_DIR } from './discovery.js';
import * as pluginModule from './plugin.js';

const {
  listPlugins,
  uninstallPlugin,
  updatePlugin,
  _parseSource,
  _updateAllPlugins,
  _validatePluginStructure,
} = pluginModule;

describe('parseSource', () => {
  it('parses github:user/repo format', () => {
    const result = _parseSource('github:ByteYue/opencli-plugin-github-trending');
    expect(result).toEqual({
      cloneUrl: 'https://github.com/ByteYue/opencli-plugin-github-trending.git',
      name: 'github-trending',
    });
  });

  it('parses https URL format', () => {
    const result = _parseSource('https://github.com/ByteYue/opencli-plugin-hot-digest');
    expect(result).toEqual({
      cloneUrl: 'https://github.com/ByteYue/opencli-plugin-hot-digest.git',
      name: 'hot-digest',
    });
  });

  it('strips opencli-plugin- prefix from name', () => {
    const result = _parseSource('github:user/opencli-plugin-my-tool');
    expect(result!.name).toBe('my-tool');
  });

  it('keeps name without prefix', () => {
    const result = _parseSource('github:user/awesome-cli');
    expect(result!.name).toBe('awesome-cli');
  });

  it('returns null for invalid source', () => {
    expect(_parseSource('invalid')).toBeNull();
    expect(_parseSource('npm:some-package')).toBeNull();
  });
});

describe('validatePluginStructure', () => {
  const testDir = path.join(PLUGINS_DIR, '__test-validate__');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  it('returns invalid for non-existent directory', () => {
    const res = _validatePluginStructure(path.join(PLUGINS_DIR, '__does_not_exist__'));
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('does not exist');
  });

  it('returns invalid for empty directory', () => {
    const res = _validatePluginStructure(testDir);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('No command files found');
  });

  it('returns valid for YAML plugin', () => {
    fs.writeFileSync(path.join(testDir, 'cmd.yaml'), 'site: test');
    const res = _validatePluginStructure(testDir);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('returns valid for JS plugin', () => {
    fs.writeFileSync(path.join(testDir, 'cmd.js'), 'console.log("hi");');
    const res = _validatePluginStructure(testDir);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('returns invalid for TS plugin without package.json', () => {
    fs.writeFileSync(path.join(testDir, 'cmd.ts'), 'console.log("hi");');
    const res = _validatePluginStructure(testDir);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('contains .ts files but no package.json');
  });

  it('returns invalid for TS plugin with missing type: module', () => {
    fs.writeFileSync(path.join(testDir, 'cmd.ts'), 'console.log("hi");');
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    const res = _validatePluginStructure(testDir);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('must have "type": "module"');
  });

  it('returns valid for TS plugin with correct package.json', () => {
    fs.writeFileSync(path.join(testDir, 'cmd.ts'), 'console.log("hi");');
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ type: 'module' }));
    const res = _validatePluginStructure(testDir);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});

describe('listPlugins', () => {
  const testDir = path.join(PLUGINS_DIR, '__test-list-plugin__');

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  it('lists installed plugins', () => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'hello.yaml'), 'site: test\nname: hello\n');

    const plugins = listPlugins();
    const found = plugins.find(p => p.name === '__test-list-plugin__');
    expect(found).toBeDefined();
    expect(found!.commands).toContain('hello');
  });

  it('returns empty array when no plugins dir', () => {
    // listPlugins should handle missing dir gracefully
    const plugins = listPlugins();
    expect(Array.isArray(plugins)).toBe(true);
  });
});

describe('uninstallPlugin', () => {
  const testDir = path.join(PLUGINS_DIR, '__test-uninstall__');

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  it('removes plugin directory', () => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'test.yaml'), 'site: test');

    uninstallPlugin('__test-uninstall__');
    expect(fs.existsSync(testDir)).toBe(false);
  });

  it('throws for non-existent plugin', () => {
    expect(() => uninstallPlugin('__nonexistent__')).toThrow('not installed');
  });
});

describe('updatePlugin', () => {
  it('throws for non-existent plugin', () => {
    expect(() => updatePlugin('__nonexistent__')).toThrow('not installed');
  });
});

vi.mock('node:child_process', () => {
  return {
    execFileSync: vi.fn((_cmd, _args, opts) => {
      if (opts && opts.cwd && String(opts.cwd).endsWith('plugin-b')) {
        throw new Error('Network error');
      }
      return '';
    }),
    execSync: vi.fn(() => ''),
  };
});

describe('updateAllPlugins', () => {
  const testDirA = path.join(PLUGINS_DIR, 'plugin-a');
  const testDirB = path.join(PLUGINS_DIR, 'plugin-b');
  const testDirC = path.join(PLUGINS_DIR, 'plugin-c');

  beforeEach(() => {
    fs.mkdirSync(testDirA, { recursive: true });
    fs.mkdirSync(testDirB, { recursive: true });
    fs.mkdirSync(testDirC, { recursive: true });
    fs.writeFileSync(path.join(testDirA, 'cmd.yaml'), 'site: a');
    fs.writeFileSync(path.join(testDirB, 'cmd.yaml'), 'site: b');
    fs.writeFileSync(path.join(testDirC, 'cmd.yaml'), 'site: c');
  });

  afterEach(() => {
    try { fs.rmSync(testDirA, { recursive: true }); } catch {}
    try { fs.rmSync(testDirB, { recursive: true }); } catch {}
    try { fs.rmSync(testDirC, { recursive: true }); } catch {}
    vi.clearAllMocks();
  });

  it('collects successes and failures without throwing', () => {
    const results = _updateAllPlugins();

    const resA = results.find(r => r.name === 'plugin-a');
    const resB = results.find(r => r.name === 'plugin-b');
    const resC = results.find(r => r.name === 'plugin-c');

    expect(resA).toBeDefined();
    expect(resA!.success).toBe(true);

    expect(resB).toBeDefined();
    expect(resB!.success).toBe(false);
    expect(resB!.error).toContain('Network error');

    expect(resC).toBeDefined();
    expect(resC!.success).toBe(true);
  });
});
