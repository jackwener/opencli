import { execSync } from 'node:child_process';
import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

export const statusCommand = cli({
  site: 'chatgpt',
  name: 'status',
  description: 'Check if ChatGPT Desktop App is running natively on macOS',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [],
  columns: ['Status'],
  func: async (page: IPage | null) => {
    if (process.platform !== 'darwin') {
      throw new Error('ChatGPT Desktop integration requires macOS (osascript is not available on this platform)');
    }

    try {
      const output = execSync("osascript -e 'application \"ChatGPT\" is running'", { encoding: 'utf-8' }).trim();
      return [{ Status: output === 'true' ? 'Running' : 'Stopped' }];
    } catch {
      return [{ Status: 'Error querying application state' }];
    }
  },
});
