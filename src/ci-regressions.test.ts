import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('CI regression coverage', () => {
  it('runs adapter tests from src/clis and keeps them out of the unit project', () => {
    const adapterList = execFileSync(
      'npx',
      ['vitest', 'list', '--project', 'adapter'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    const unitList = execFileSync(
      'npx',
      ['vitest', 'list', '--project', 'unit'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(adapterList).toContain('src/clis/binance/commands.test.ts');
    expect(unitList).not.toContain('src/clis/binance/commands.test.ts');
  });

  it('ignores helper-only adapter directories when checking docs coverage', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-doc-coverage-'));
    tempDirs.push(fixtureRoot);

    const scriptsDir = path.join(fixtureRoot, 'scripts');
    const clisDir = path.join(fixtureRoot, 'clis', 'slock');
    const docsBrowserDir = path.join(fixtureRoot, 'docs', 'adapters', 'browser');
    const docsDesktopDir = path.join(fixtureRoot, 'docs', 'adapters', 'desktop');

    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(clisDir, { recursive: true });
    fs.mkdirSync(docsBrowserDir, { recursive: true });
    fs.mkdirSync(docsDesktopDir, { recursive: true });

    fs.copyFileSync(
      path.join(process.cwd(), 'scripts', 'check-doc-coverage.sh'),
      path.join(scriptsDir, 'check-doc-coverage.sh'),
    );
    fs.writeFileSync(
      path.join(clisDir, '_utils.js'),
      'export const helper = () => "noop";\n',
    );

    const output = execFileSync(
      'bash',
      [path.join(scriptsDir, 'check-doc-coverage.sh'), '--strict'],
      {
        cwd: fixtureRoot,
        encoding: 'utf8',
      },
    );

    expect(output).toContain('Doc Coverage: 0/0 adapters documented');
    expect(output).toContain('All adapters have documentation');
  });

  it('keeps nested-only adapter directories in doc coverage until they are documented', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-doc-coverage-'));
    tempDirs.push(fixtureRoot);

    const scriptsDir = path.join(fixtureRoot, 'scripts');
    const nestedAdapterDir = path.join(fixtureRoot, 'clis', 'ghost', 'nested');
    const docsBrowserDir = path.join(fixtureRoot, 'docs', 'adapters', 'browser');
    const docsDesktopDir = path.join(fixtureRoot, 'docs', 'adapters', 'desktop');

    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(nestedAdapterDir, { recursive: true });
    fs.mkdirSync(docsBrowserDir, { recursive: true });
    fs.mkdirSync(docsDesktopDir, { recursive: true });

    fs.copyFileSync(
      path.join(process.cwd(), 'scripts', 'check-doc-coverage.sh'),
      path.join(scriptsDir, 'check-doc-coverage.sh'),
    );
    fs.writeFileSync(
      path.join(nestedAdapterDir, 'read.js'),
      'export const command = "ghost";\n',
    );

    try {
      execFileSync(
        'bash',
        [path.join(scriptsDir, 'check-doc-coverage.sh'), '--strict'],
        {
          cwd: fixtureRoot,
          encoding: 'utf8',
        },
      );
      throw new Error('Expected nested-only adapter directory to fail doc coverage');
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; status?: number };

      expect(failure.status).toBe(1);
      expect(failure.stdout).toContain('Doc Coverage: 0/1 adapters documented');
      expect(failure.stdout).toContain('ghost');
    }
  });
});
