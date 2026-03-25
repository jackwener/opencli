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
});
