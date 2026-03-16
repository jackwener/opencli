import { describe, expect, it } from 'vitest';
import {
  readTokenFromShellContent,
  renderBrowserDoctorReport,
  upsertShellToken,
  readTomlConfigToken,
  upsertTomlConfigToken,
  upsertJsonConfigToken,
} from './doctor.js';

describe('shell token helpers', () => {
  it('reads token from shell export', () => {
    expect(readTokenFromShellContent('export PLAYWRIGHT_MCP_EXTENSION_TOKEN="abc123"\n')).toBe('abc123');
  });

  it('appends token export when missing', () => {
    const next = upsertShellToken('export PATH="/usr/bin"\n', 'abc123');
    expect(next).toContain('export PLAYWRIGHT_MCP_EXTENSION_TOKEN="abc123"');
  });

  it('replaces token export when present', () => {
    const next = upsertShellToken('export PLAYWRIGHT_MCP_EXTENSION_TOKEN="old"\n', 'new');
    expect(next).toContain('export PLAYWRIGHT_MCP_EXTENSION_TOKEN="new"');
    expect(next).not.toContain('"old"');
  });
});

describe('toml token helpers', () => {
  it('reads token from playwright env section', () => {
    const content = `
[mcp_servers.playwright.env]
PLAYWRIGHT_MCP_EXTENSION_TOKEN = "abc123"
`;
    expect(readTomlConfigToken(content)).toBe('abc123');
  });

  it('updates token inside existing env section', () => {
    const content = `
[mcp_servers.playwright.env]
PLAYWRIGHT_MCP_EXTENSION_TOKEN = "old"
`;
    const next = upsertTomlConfigToken(content, 'new');
    expect(next).toContain('PLAYWRIGHT_MCP_EXTENSION_TOKEN = "new"');
    expect(next).not.toContain('"old"');
  });

  it('creates env section when missing', () => {
    const content = `
[mcp_servers.playwright]
type = "stdio"
`;
    const next = upsertTomlConfigToken(content, 'abc123');
    expect(next).toContain('[mcp_servers.playwright.env]');
    expect(next).toContain('PLAYWRIGHT_MCP_EXTENSION_TOKEN = "abc123"');
  });
});

describe('json token helpers', () => {
  it('writes token into standard mcpServers config', () => {
    const next = upsertJsonConfigToken(JSON.stringify({
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['-y', '@playwright/mcp@latest', '--extension'],
        },
      },
    }), 'abc123');
    const parsed = JSON.parse(next);
    expect(parsed.mcpServers.playwright.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN).toBe('abc123');
  });

  it('writes token into opencode mcp config', () => {
    const next = upsertJsonConfigToken(JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        playwright: {
          command: ['npx', '-y', '@playwright/mcp@latest', '--extension'],
          enabled: true,
          type: 'local',
        },
      },
    }), 'abc123');
    const parsed = JSON.parse(next);
    expect(parsed.mcp.playwright.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN).toBe('abc123');
  });
});

describe('doctor report rendering', () => {
  it('renders OK-style report when tokens match', () => {
    const text = renderBrowserDoctorReport({
      envToken: 'abc123',
      envFingerprint: 'fp1',
      shellFiles: [{ path: '/tmp/.zshrc', exists: true, token: 'abc123', fingerprint: 'fp1' }],
      configs: [{ path: '/tmp/mcp.json', exists: true, format: 'json', token: 'abc123', fingerprint: 'fp1', writable: true }],
      remoteDebuggingEnabled: true,
      remoteDebuggingEndpoint: 'ws://127.0.0.1:9222/devtools/browser/test',
      cdpEnabled: false,
      cdpToken: null,
      cdpFingerprint: null,
      recommendedToken: 'abc123',
      recommendedFingerprint: 'fp1',
      warnings: [],
      issues: [],
    });

    expect(text).toContain('[OK] Chrome remote debugging: enabled');
    expect(text).toContain('[OK] Environment token: configured (fp1)');
    expect(text).toContain('[OK] MCP config /tmp/mcp.json: configured (fp1)');
  });

  it('renders MISMATCH-style report when fingerprints differ', () => {
    const text = renderBrowserDoctorReport({
      envToken: 'abc123',
      envFingerprint: 'fp1',
      shellFiles: [{ path: '/tmp/.zshrc', exists: true, token: 'def456', fingerprint: 'fp2' }],
      configs: [{ path: '/tmp/mcp.json', exists: true, format: 'json', token: 'abc123', fingerprint: 'fp1', writable: true }],
      remoteDebuggingEnabled: false,
      remoteDebuggingEndpoint: null,
      cdpEnabled: false,
      cdpToken: null,
      cdpFingerprint: null,
      recommendedToken: 'abc123',
      recommendedFingerprint: 'fp1',
      warnings: ['Chrome remote debugging appears to be disabled or Chrome is not currently exposing a DevTools endpoint.'],
      issues: ['Detected inconsistent Playwright MCP tokens across env/config files.'],
    });

    expect(text).toContain('[WARN] Chrome remote debugging: disabled');
    expect(text).toContain('[MISMATCH] Environment token: configured (fp1)');
    expect(text).toContain('[MISMATCH] Shell file /tmp/.zshrc: configured (fp2)');
    expect(text).toContain('[MISMATCH] Recommended token fingerprint: fp1');
  });
});
