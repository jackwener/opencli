import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { Strategy, type CliCommand } from './registry.js';
import { registerCommandToProgram } from './commanderAdapter.js';

function buildCommand(overrides: Partial<CliCommand> = {}): CliCommand {
  return {
    site: 'demo',
    name: 'run',
    description: 'demo command',
    strategy: Strategy.COOKIE,
    browser: true,
    args: [],
    ...overrides,
  };
}

describe('registerCommandToProgram', () => {
  it('adds --browser-cdp to browser-backed commands', () => {
    const siteCmd = new Command('demo');

    registerCommandToProgram(siteCmd, buildCommand());

    const subCmd = siteCmd.commands[0];
    const longFlags = subCmd.options.map(option => option.long);

    expect(longFlags).toContain('--browser-cdp');
  });

  it('does not add --browser-cdp to non-browser commands', () => {
    const siteCmd = new Command('demo');

    registerCommandToProgram(siteCmd, buildCommand({
      browser: false,
      strategy: Strategy.PUBLIC,
    }));

    const subCmd = siteCmd.commands[0];
    const longFlags = subCmd.options.map(option => option.long);

    expect(longFlags).not.toContain('--browser-cdp');
  });
});
