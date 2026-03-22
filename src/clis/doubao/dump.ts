import * as fs from 'fs';
import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

export const dumpCommand = cli({
  site: 'doubao',
  name: 'dump',
  description: 'Dump Doubao DOM and accessibility tree to /tmp/doubao-*.html',
  domain: 'doubao',
  strategy: Strategy.UI,
  browser: true,
  args: [],
  columns: ['Status', 'File'],
  func: async (page: IPage) => {
    const htmlPath = '/tmp/doubao-dom.html';
    const snapPath = '/tmp/doubao-snapshot.json';

    const html = await page.evaluate('document.documentElement.outerHTML');
    const snap = await page.snapshot({ compact: true });

    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(snapPath, typeof snap === 'string' ? snap : JSON.stringify(snap, null, 2));

    return [
      { Status: 'Success', File: htmlPath },
      { Status: 'Success', File: snapPath },
    ];
  },
});