/**
 * Unified error types for opencli.
 *
 * All errors thrown by the framework should extend CliError so that
 * the top-level handler in commanderAdapter.ts can render consistent,
 * helpful output with emoji-coded severity and actionable hints.
 */

export class CliError extends Error {
  /** Machine-readable error code (e.g. 'BROWSER_CONNECT', 'AUTH_REQUIRED') */
  readonly code: string;
  /** Human-readable hint on how to fix the problem */
  readonly hint?: string;

  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.hint = hint;
  }
}

// ── Browser / Connection ────────────────────────────────────────────────────

export class BrowserConnectError extends CliError {
  constructor(message: string, hint?: string) {
    super('BROWSER_CONNECT', message, hint);
    this.name = 'BrowserConnectError';
  }
}

// ── Adapter loading ─────────────────────────────────────────────────────────

export class AdapterLoadError extends CliError {
  constructor(message: string, hint?: string) {
    super('ADAPTER_LOAD', message, hint);
    this.name = 'AdapterLoadError';
  }
}

// ── Command execution ───────────────────────────────────────────────────────

export class CommandExecutionError extends CliError {
  constructor(message: string, hint?: string) {
    super('COMMAND_EXEC', message, hint);
    this.name = 'CommandExecutionError';
  }
}

// ── Configuration ───────────────────────────────────────────────────────────

export class ConfigError extends CliError {
  constructor(message: string, hint?: string) {
    super('CONFIG', message, hint);
    this.name = 'ConfigError';
  }
}

// ── Authentication / Login ──────────────────────────────────────────────────

export class AuthRequiredError extends CliError {
  readonly domain: string;

  constructor(domain: string, message?: string) {
    super(
      'AUTH_REQUIRED',
      message ?? `Not logged in to ${domain}`,
      `Please open Chrome and log in to https://${domain}`,
    );
    this.name = 'AuthRequiredError';
    this.domain = domain;
  }
}

// ── Timeout ─────────────────────────────────────────────────────────────────

export class TimeoutError extends CliError {
  constructor(label: string, seconds: number) {
    super(
      'TIMEOUT',
      `${label} timed out after ${seconds}s`,
      'Try again, or increase timeout with OPENCLI_BROWSER_COMMAND_TIMEOUT env var',
    );
    this.name = 'TimeoutError';
  }
}

// ── Argument validation ─────────────────────────────────────────────────────

export class ArgumentError extends CliError {
  constructor(message: string, hint?: string) {
    super('ARGUMENT', message, hint);
    this.name = 'ArgumentError';
  }
}

// ── Empty result ────────────────────────────────────────────────────────────

export class EmptyResultError extends CliError {
  constructor(command: string, hint?: string) {
    super(
      'EMPTY_RESULT',
      `${command} returned no data`,
      hint ?? 'The page structure may have changed, or you may need to log in',
    );
    this.name = 'EmptyResultError';
  }
}

// ── Selector / DOM ──────────────────────────────────────────────────────────

export class SelectorError extends CliError {
  constructor(selector: string, hint?: string) {
    super(
      'SELECTOR',
      `Could not find element: ${selector}`,
      hint ?? 'The page UI may have changed. Please report this issue.',
    );
    this.name = 'SelectorError';
  }
}

// ── Utilities ───────────────────────────────────────────────────────────

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Error code → emoji mapping for CLI output rendering. */
export const ERROR_ICONS: Record<string, string> = {
  AUTH_REQUIRED: '🔒',
  BROWSER_CONNECT: '🔌',
  TIMEOUT: '⏱ ',
  ARGUMENT: '❌',
  EMPTY_RESULT: '📭',
  SELECTOR: '🔍',
};
