export const DEFAULT_DAEMON_HOST = '127.0.0.1';
export const DEFAULT_DAEMON_PORT = 19825;

export interface DaemonEndpointConfig {
  host: string;
  port: number;
}

type StorageLike = Pick<chrome.storage.StorageArea, 'get'>;

function normalizeHost(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizePort(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  }
  return undefined;
}

export async function getDaemonEndpointConfig(
  storage: StorageLike | undefined = chrome.storage?.local,
): Promise<DaemonEndpointConfig> {
  if (!storage) {
    return {
      host: DEFAULT_DAEMON_HOST,
      port: DEFAULT_DAEMON_PORT,
    };
  }
  const raw = await storage.get(['daemonHost', 'daemonPort']);
  return {
    host: normalizeHost(raw.daemonHost) ?? DEFAULT_DAEMON_HOST,
    port: normalizePort(raw.daemonPort) ?? DEFAULT_DAEMON_PORT,
  };
}

export function buildDaemonUrls(config: DaemonEndpointConfig): { pingUrl: string; wsUrl: string } {
  return {
    pingUrl: `http://${config.host}:${config.port}/ping`,
    wsUrl: `ws://${config.host}:${config.port}/ext`,
  };
}
