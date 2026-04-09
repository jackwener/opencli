import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import yaml from 'js-yaml';

import { DEFAULT_DAEMON_PORT } from './constants.js';

export const DEFAULT_DAEMON_HOST = '127.0.0.1';

export interface DaemonFileConfig {
  host?: string;
  port?: number;
}

export interface DaemonConfig {
  host: string;
  port: number;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPort(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  }
  return undefined;
}

export function getDaemonConfigPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.opencli', 'daemon.yaml');
}

export function loadDaemonConfig(configPath: string = getDaemonConfigPath()): DaemonFileConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return parseDaemonConfig(raw);
  } catch {
    return {};
  }
}

export function saveDaemonConfig(config: DaemonFileConfig, configPath: string = getDaemonConfigPath()): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const normalized: DaemonFileConfig = {};
  if (readString(config.host)) normalized.host = readString(config.host);
  if (readPort(config.port) !== undefined) normalized.port = readPort(config.port);
  const serialized = yaml.dump(normalized, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: true });
  fs.writeFileSync(configPath, serialized, 'utf-8');
}

export function parseDaemonConfig(raw: string): DaemonFileConfig {
  const parsed = yaml.load(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return {};
  return {
    host: readString(parsed.host),
    port: readPort(parsed.port),
  };
}

export function resolveDaemonConfig(
  env: NodeJS.ProcessEnv = process.env,
  fileConfig: DaemonFileConfig = loadDaemonConfig(),
): DaemonConfig {
  const host = readString(env.OPENCLI_DAEMON_HOST) ?? fileConfig.host ?? DEFAULT_DAEMON_HOST;
  const port = readPort(env.OPENCLI_DAEMON_PORT) ?? fileConfig.port ?? DEFAULT_DAEMON_PORT;
  return { host, port };
}

export function getDaemonConnectHost(host: string): string {
  if (host === '0.0.0.0') return '127.0.0.1';
  if (host === '::' || host === '::0') return '[::1]';
  return host;
}

export function getDaemonBaseUrl(config: DaemonConfig = resolveDaemonConfig()): string {
  return `http://${getDaemonConnectHost(config.host)}:${config.port}`;
}
