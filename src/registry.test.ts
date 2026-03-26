/**
 * Tests for registry.ts: Strategy enum, cli() registration, helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { cli, getRegistry, fullName, strategyLabel, registerCommand, Strategy, type CliCommand } from './registry.js';

describe('cli() registration', () => {
  it('registers a command and returns it', () => {
    const cmd = cli({
      site: 'test-registry',
      name: 'hello',
      description: 'A test command',
      strategy: Strategy.PUBLIC,
      browser: false,
    });

    expect(cmd.site).toBe('test-registry');
    expect(cmd.name).toBe('hello');
    expect(cmd.strategy).toBe(Strategy.PUBLIC);
    expect(cmd.browser).toBe(false);
    expect(cmd.args).toEqual([]);
  });

  it('puts registered command in the registry', () => {
    cli({
      site: 'test-registry',
      name: 'registered',
      description: 'test',
    });

    const registry = getRegistry();
    expect(registry.has('test-registry/registered')).toBe(true);
  });

  it('defaults strategy to COOKIE when browser is true', () => {
    const cmd = cli({
      site: 'test-registry',
      name: 'default-strategy',
    });

    expect(cmd.strategy).toBe(Strategy.COOKIE);
    expect(cmd.browser).toBe(true);
  });

  it('defaults strategy to PUBLIC when browser is false', () => {
    const cmd = cli({
      site: 'test-registry',
      name: 'no-browser',
      browser: false,
    });

    expect(cmd.strategy).toBe(Strategy.PUBLIC);
  });

  it('disables browser-cdp by default for local desktop UI targets', () => {
    const localhostCmd = cli({
      site: 'test-registry',
      name: 'localhost-ui',
      domain: 'localhost',
      strategy: Strategy.UI,
      browser: true,
    });
    const appCmd = cli({
      site: 'test-registry',
      name: 'app-ui',
      domain: 'doubao-app',
      strategy: Strategy.UI,
      browser: true,
    });

    expect(localhostCmd.supportsBrowserCdp).toBe(false);
    expect(appCmd.supportsBrowserCdp).toBe(false);
  });

  it('keeps browser-cdp enabled for real website UI targets', () => {
    const cmd = cli({
      site: 'test-registry',
      name: 'remote-ui',
      domain: 'x.com',
      strategy: Strategy.UI,
      browser: true,
    });

    expect(cmd.supportsBrowserCdp).toBe(true);
  });

  it('overwrites existing command on re-registration', () => {
    cli({ site: 'test-registry', name: 'overwrite', description: 'v1' });
    cli({ site: 'test-registry', name: 'overwrite', description: 'v2' });

    const reg = getRegistry();
    expect(reg.get('test-registry/overwrite')?.description).toBe('v2');
  });
});

describe('fullName', () => {
  it('returns site/name', () => {
    const cmd: CliCommand = {
      site: 'bilibili', name: 'hot', description: '', args: [],
    };
    expect(fullName(cmd)).toBe('bilibili/hot');
  });
});

describe('strategyLabel', () => {
  it('returns strategy string', () => {
    const cmd: CliCommand = {
      site: 'test', name: 'test', description: '', args: [],
      strategy: Strategy.INTERCEPT,
    };
    expect(strategyLabel(cmd)).toBe('intercept');
  });

  it('returns public when no strategy set', () => {
    const cmd: CliCommand = {
      site: 'test', name: 'test', description: '', args: [],
    };
    expect(strategyLabel(cmd)).toBe('public');
  });
});

describe('registerCommand', () => {
  it('registers a pre-built command', () => {
    const cmd: CliCommand = {
      site: 'test-registry',
      name: 'direct-reg',
      description: 'directly registered',
      args: [],
      strategy: Strategy.HEADER,
      browser: true,
    };
    registerCommand(cmd);

    const reg = getRegistry();
    expect(reg.get('test-registry/direct-reg')?.strategy).toBe(Strategy.HEADER);
  });
});
