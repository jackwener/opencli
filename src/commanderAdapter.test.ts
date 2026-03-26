import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliCommand } from './registry.js';

const { mockExecuteCommand, mockRender } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
  mockRender: vi.fn(),
}));

vi.mock('./execution.js', () => ({
  executeCommand: mockExecuteCommand,
}));

vi.mock('./output.js', () => ({
  render: mockRender,
}));

import { registerCommandToProgram } from './commanderAdapter.js';

describe('registerCommandToProgram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
  });

  it('applies command-level CDP overrides only while a browser command executes', async () => {
    const seen: Array<{ endpoint?: string; target?: string }> = [];
    mockExecuteCommand.mockImplementation(async () => {
      seen.push({
        endpoint: process.env.OPENCLI_CDP_ENDPOINT,
        target: process.env.OPENCLI_CDP_TARGET,
      });
      return [];
    });

    const cmd: CliCommand = {
      site: 'antigravity',
      name: 'status',
      description: 'status',
      browser: true,
      supportsBrowserCdp: false,
      args: [],
    };

    const program = new Command();
    const siteCmd = program.command('antigravity');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync([
      'node',
      'opencli',
      'antigravity',
      'status',
      '--cdp-endpoint',
      'http://127.0.0.1:9333',
      '--cdp-target',
      'launchpad',
    ]);

    expect(mockExecuteCommand).toHaveBeenCalledWith(cmd, {}, false);
    expect(seen).toEqual([
      {
        endpoint: 'http://127.0.0.1:9333',
        target: 'launchpad',
      },
    ]);
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBeUndefined();
    expect(process.env.OPENCLI_CDP_TARGET).toBeUndefined();
  });

  it('enables browser-cdp auto mode only for supported browser commands', async () => {
    const seen: Array<{ endpoint?: string }> = [];
    mockExecuteCommand.mockImplementation(async () => {
      seen.push({ endpoint: process.env.OPENCLI_CDP_ENDPOINT });
      return [];
    });

    const cmd: CliCommand = {
      site: 'linux-do',
      name: 'categories',
      description: 'categories',
      browser: true,
      supportsBrowserCdp: true,
      args: [],
    };

    const program = new Command();
    const siteCmd = program.command('linux-do');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync([
      'node',
      'opencli',
      'linux-do',
      'categories',
      '--browser-cdp',
    ]);

    expect(seen).toEqual([{ endpoint: 'auto' }]);
    expect(process.env.OPENCLI_CDP_ENDPOINT).toBeUndefined();
  });

  it('does not register browser-cdp flags for desktop-style commands', async () => {
    const cmd: CliCommand = {
      site: 'cursor',
      name: 'ask',
      description: 'ask',
      browser: true,
      supportsBrowserCdp: false,
      args: [],
    };

    const program = new Command();
    program.exitOverride();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const siteCmd = program.command('cursor');
    registerCommandToProgram(siteCmd, cmd);

    await expect(program.parseAsync([
      'node',
      'opencli',
      'cursor',
      'ask',
      '--browser-cdp',
    ])).rejects.toThrow();

    errorSpy.mockRestore();
  });
});
