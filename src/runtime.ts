import { BrowserBridge, CDPBridge } from './browser/index.js';
import type { IPage } from './types.js';
import { TimeoutError } from './errors.js';

export type BrowserEnvOverrides = {
  browserCdp?: boolean;
  cdpEndpoint?: string;
  cdpTarget?: string;
};

export interface BrowserEnvOverrideConfig {
  allowBrowserCdp?: boolean;
}

/**
 * Returns the appropriate browser factory based on environment config.
 * Uses CDPBridge when OPENCLI_CDP_ENDPOINT is set, otherwise BrowserBridge.
 */
export function getBrowserFactory(): new () => IBrowserFactory {
  return (process.env.OPENCLI_CDP_ENDPOINT ? CDPBridge : BrowserBridge) as unknown as new () => IBrowserFactory;
}

export function extractBrowserEnvOverrides(options?: Record<string, unknown> | null): BrowserEnvOverrides {
  const input = options ?? {};
  return {
    browserCdp: readBooleanOption(input['browser-cdp'] ?? input.browserCdp),
    cdpEndpoint: readCdpEndpointOption(input['cdp-endpoint'] ?? input.cdpEndpoint),
    cdpTarget: readStringOption(input['cdp-target'] ?? input.cdpTarget),
  };
}

export async function withBrowserEnvOverrides<T>(
  overrides: BrowserEnvOverrides,
  fn: () => Promise<T>,
  config: BrowserEnvOverrideConfig = {},
): Promise<T> {
  const effectiveEndpoint = resolveEffectiveCdpEndpoint(overrides, config);
  const pairs: Array<[key: 'OPENCLI_CDP_ENDPOINT' | 'OPENCLI_CDP_TARGET', value: string | null | undefined]> = [
    ['OPENCLI_CDP_ENDPOINT', effectiveEndpoint],
    ['OPENCLI_CDP_TARGET', overrides.cdpTarget],
  ];
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of pairs) {
    if (value === undefined) continue;
    previous.set(key, process.env[key]);
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of pairs) {
      if (value === undefined) continue;
      const prior = previous.get(key);
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  }
}

function parseEnvTimeout(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`[runtime] Invalid ${envVar}="${raw}", using default ${fallback}s`);
    return fallback;
  }
  return parsed;
}

function readStringOption(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readBooleanOption(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function readBooleanEnv(name: string): boolean | undefined {
  return readBooleanOption(process.env[name]);
}

function readCdpEndpointOption(value: unknown): string | undefined {
  const normalized = readStringOption(value);
  if (!normalized) return undefined;
  if (normalized === 'auto') return normalized;
  if (/^(https?|wss?):\/\//.test(normalized)) return normalized;
  throw new Error('Invalid --cdp-endpoint value. Expected http://, https://, ws://, or wss:// URL.');
}

function resolveEffectiveCdpEndpoint(
  overrides: BrowserEnvOverrides,
  config: BrowserEnvOverrideConfig,
): string | null | undefined {
  if (overrides.cdpEndpoint) {
    if (overrides.cdpEndpoint === 'auto' && !config.allowBrowserCdp) {
      throw new Error('The "auto" CDP endpoint is only supported for browser CDP commands.');
    }
    return overrides.cdpEndpoint;
  }

  if (!config.allowBrowserCdp) return undefined;

  if (typeof overrides.browserCdp === 'boolean') {
    return overrides.browserCdp ? 'auto' : null;
  }

  return readBooleanEnv('OPENCLI_BROWSER_CDP') ? 'auto' : undefined;
}

export const DEFAULT_BROWSER_CONNECT_TIMEOUT = parseEnvTimeout('OPENCLI_BROWSER_CONNECT_TIMEOUT', 30);
export const DEFAULT_BROWSER_COMMAND_TIMEOUT = parseEnvTimeout('OPENCLI_BROWSER_COMMAND_TIMEOUT', 60);
export const DEFAULT_BROWSER_EXPLORE_TIMEOUT = parseEnvTimeout('OPENCLI_BROWSER_EXPLORE_TIMEOUT', 120);

/**
 * Timeout with seconds unit. Used for high-level command timeouts.
 */
export async function runWithTimeout<T>(
  promise: Promise<T>,
  opts: { timeout: number; label?: string },
): Promise<T> {
  const label = opts.label ?? 'Operation';
  return withTimeoutMs(promise, opts.timeout * 1000,
    () => new TimeoutError(label, opts.timeout));
}

/**
 * Timeout with milliseconds unit. Used for low-level internal timeouts.
 * Accepts a factory function to create the rejection error, keeping this
 * utility decoupled from specific error types.
 */
export function withTimeoutMs<T>(
  promise: Promise<T>,
  timeoutMs: number,
  makeError: string | (() => Error) = 'Operation timed out',
): Promise<T> {
  const reject_ = typeof makeError === 'string'
    ? () => new Error(makeError)
    : makeError;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(reject_()), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Interface for browser factory (BrowserBridge or test mocks) */
export interface IBrowserFactory {
  connect(opts?: { timeout?: number; workspace?: string }): Promise<IPage>;
  close(): Promise<void>;
}

export async function browserSession<T>(
  BrowserFactory: new () => IBrowserFactory,
  fn: (page: IPage) => Promise<T>,
  opts: { workspace?: string } = {},
): Promise<T> {
  const mcp = new BrowserFactory();
  try {
    const page = await mcp.connect({ timeout: DEFAULT_BROWSER_CONNECT_TIMEOUT, workspace: opts.workspace });
    return await fn(page);
  } finally {
    await mcp.close().catch(() => {});
  }
}
