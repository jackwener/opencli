/**
 * Browser connection error classification and formatting.
 */

import { createHash } from 'node:crypto';

export type ConnectFailureKind = 'missing-token' | 'extension-timeout' | 'extension-not-installed' | 'mcp-init' | 'process-exit' | 'cdp-connection-failed' | 'unknown';

export type ConnectFailureInput = {
  kind: ConnectFailureKind;
  timeout: number;
  hasExtensionToken: boolean;
  tokenFingerprint?: string | null;
  stderr?: string;
  exitCode?: number | null;
  rawMessage?: string;
};

export function getTokenFingerprint(token: string | undefined): string | null {
  if (!token) return null;
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

export function formatBrowserConnectError(input: ConnectFailureInput): Error {
  const stderr = input.stderr?.trim();
  const suffix = stderr ? `\n\nMCP stderr:\n${stderr}` : '';
  const tokenHint = input.tokenFingerprint ? ` Token fingerprint: ${input.tokenFingerprint}.` : '';

  if (input.kind === 'cdp-connection-failed') {
    return new Error(
      `Failed to connect to remote Chrome via CDP endpoint.\n\n` +
      `Check if Chrome is running with remote debugging enabled (--remote-debugging-port=9222) or DevToolsActivePort is available under chrome://inspect#remote-debugging.\n` +
      `If you specified OPENCLI_CDP_ENDPOINT=1, auto-discovery might have failed.` +
      suffix,
    );
  }

  if (input.kind === 'missing-token') {
    return new Error(
      'Failed to connect to Playwright MCP Bridge: PLAYWRIGHT_MCP_EXTENSION_TOKEN is not set.\n\n' +
      'Without this token, Chrome will show a manual approval dialog for every new MCP connection. ' +
      'Copy the token from the Playwright MCP Bridge extension and set it in BOTH your shell environment and MCP client config.' +
      suffix,
    );
  }

  if (input.kind === 'extension-not-installed') {
    return new Error(
      'Failed to connect to Playwright MCP Bridge: the browser extension did not attach.\n\n' +
      'Make sure Chrome is running and the "Playwright MCP Bridge" extension is installed and enabled. ' +
      'If Chrome shows an approval dialog, click Allow.' +
      suffix,
    );
  }

  if (input.kind === 'extension-timeout') {
    const likelyCause = input.hasExtensionToken
      ? `The most likely cause is that PLAYWRIGHT_MCP_EXTENSION_TOKEN does not match the token currently shown by the browser extension.${tokenHint} Re-copy the token from the extension and update BOTH your shell environment and MCP client config.`
      : 'PLAYWRIGHT_MCP_EXTENSION_TOKEN is not configured, so the extension may be waiting for manual approval.';
    return new Error(
      `Timed out connecting to Playwright MCP Bridge (${input.timeout}s).\n\n` +
      `${likelyCause} If a browser prompt is visible, click Allow.` +
      suffix,
    );
  }

  if (input.kind === 'mcp-init') {
    return new Error(`Failed to initialize Playwright MCP: ${input.rawMessage ?? 'unknown error'}${suffix}`);
  }

  if (input.kind === 'process-exit') {
    return new Error(
      `Playwright MCP process exited before the browser connection was established${input.exitCode == null ? '' : ` (code ${input.exitCode})`}.` +
      suffix,
    );
  }

  return new Error(input.rawMessage ?? 'Failed to connect to browser');
}

export function inferConnectFailureKind(args: {
  hasExtensionToken: boolean;
  stderr: string;
  rawMessage?: string;
  exited?: boolean;
  isCdpMode?: boolean;
}): ConnectFailureKind {
  const haystack = `${args.rawMessage ?? ''}\n${args.stderr}`.toLowerCase();

  if (args.isCdpMode) {
    if (args.rawMessage?.startsWith('MCP init failed:')) return 'mcp-init';
    if (args.exited) return 'cdp-connection-failed';
    return 'cdp-connection-failed';
  }

  if (!args.hasExtensionToken)
    return 'missing-token';
  if (haystack.includes('extension connection timeout') || haystack.includes('playwright mcp bridge'))
    return 'extension-not-installed';
  if (args.rawMessage?.startsWith('MCP init failed:'))
    return 'mcp-init';
  if (args.exited)
    return 'process-exit';
  return 'extension-timeout';
}
