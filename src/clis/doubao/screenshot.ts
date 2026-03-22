import * as fs from 'fs';
import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

export const screenshotCommand = cli({
  site: 'doubao',
  name: 'screenshot',
  description: 'Capture a screenshot of the Doubao AI window',
  domain: 'doubao',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'output', required: false, help: 'Output file path, default: /tmp/doubao-screenshot.png' },
  ],
  columns: ['Status', 'File'],
  func: async (page: IPage, kwargs: any) => {
    const outputPath = (kwargs.output as string) || '/tmp/doubao-screenshot.png';
    
    try {
      const base64 = await page.screenshot({ path: outputPath });
      return [{ Status: 'Success', File: outputPath }];
    } catch (e: any) {
      return [{ Status: 'Error: ' + e.message, File: '' }];
    }
  },
});