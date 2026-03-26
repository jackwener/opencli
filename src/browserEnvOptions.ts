import { Command } from 'commander';
import { extractBrowserEnvOverrides, withBrowserEnvOverrides } from './runtime.js';

export interface BrowserEnvOptionConfig {
  allowBrowserCdp?: boolean;
}

export function addBrowserEnvOverrideOptions(
  command: Command,
  config: BrowserEnvOptionConfig = {},
): Command {
  command
    .option('--cdp-endpoint <url>', 'Override the CDP endpoint for this command')
    .option('--cdp-target <pattern>', 'Prefer a CDP target whose title or URL matches this pattern');

  if (config.allowBrowserCdp) {
    command
      .option('--browser-cdp', 'Connect directly to a local Chrome CDP session and bypass the daemon/extension')
      .option('--no-browser-cdp', 'Disable direct Chrome CDP mode for this command, even if enabled globally');
  }

  return command;
}

export async function runWithBrowserEnvOptions<T>(
  options: Record<string, unknown> | null | undefined,
  fn: () => Promise<T>,
  config: BrowserEnvOptionConfig = {},
): Promise<T> {
  return withBrowserEnvOverrides(extractBrowserEnvOverrides(options), fn, config);
}
