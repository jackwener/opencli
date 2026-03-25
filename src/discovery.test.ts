import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverClis } from './discovery.js';
import { getRegistry } from './registry.js';

describe('discoverClis', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    getRegistry().delete('chatwise-test/status');
  });

  it('loads shared desktop factory modules during filesystem discovery', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-discovery-'));
    tempDirs.push(dir);

    const sharedDir = path.join(dir, '_shared');
    const siteDir = path.join(dir, 'chatwise-test');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.mkdirSync(siteDir, { recursive: true });

    const registryImport = path.join(process.cwd(), 'src', 'registry.ts').replace(/\\/g, '/');

    fs.writeFileSync(
      path.join(sharedDir, 'desktop-commands.ts'),
      `
        import { cli, Strategy } from '${registryImport}';
        export function makeStatusCommand(site, displayName) {
          const label = displayName ?? site;
          return cli({
            site,
            name: 'status',
            description: \`Check active CDP connection to \${label}\`,
            strategy: Strategy.UI,
            browser: true,
            columns: ['Status', 'Url', 'Title'],
          });
        }
      `,
    );

    fs.writeFileSync(
      path.join(siteDir, 'status.ts'),
      `
        import { makeStatusCommand } from '../_shared/desktop-commands.ts';
        export const statusCommand = makeStatusCommand('chatwise-test', 'ChatWise Test');
      `,
    );

    await discoverClis(dir);

    expect(getRegistry().get('chatwise-test/status')).toMatchObject({
      site: 'chatwise-test',
      name: 'status',
      description: 'Check active CDP connection to ChatWise Test',
    });
  });
});
