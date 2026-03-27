import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';

const LOOPBACK_HOSTS = new Set(['localhost', '::1', '[::1]']);
const LOOPBACK_NO_PROXY_ENTRIES = ['127.0.0.1', 'localhost', '::1'];

type ProxyEnvKey =
  | 'http_proxy'
  | 'https_proxy'
  | 'all_proxy'
  | 'HTTP_PROXY'
  | 'HTTPS_PROXY'
  | 'ALL_PROXY';

const PROXY_ENV_BY_PROTOCOL: Record<'http:' | 'https:', ProxyEnvKey[]> = {
  'http:': ['http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'],
  'https:': ['https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY'],
};

export interface ProxyDecision {
  mode: 'direct' | 'proxy';
  proxyUrl?: string;
}

let installed = false;
const directDispatcher = new Agent();
const proxyDispatcherCache = new Map<string, Dispatcher>();
const nativeFetch = globalThis.fetch.bind(globalThis);

function readEnv(env: NodeJS.ProcessEnv, lower: string, upper: string): string | undefined {
  const lowerValue = env[lower];
  if (typeof lowerValue === 'string' && lowerValue.trim() !== '') return lowerValue;
  const upperValue = env[upper];
  if (typeof upperValue === 'string' && upperValue.trim() !== '') return upperValue;
  return undefined;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return LOOPBACK_HOSTS.has(normalized) || normalized.startsWith('127.');
}

function effectiveNoProxyEntries(env: NodeJS.ProcessEnv): string[] {
  const raw = readEnv(env, 'no_proxy', 'NO_PROXY');
  const entries = (raw ?? '')
    .split(',')
    .map(token => token.trim())
    .filter(Boolean);
  return [...entries, ...LOOPBACK_NO_PROXY_ENTRIES];
}

function parseNoProxyEntry(entry: string): { host: string; port?: string } {
  if (entry === '*') return { host: '*' };

  const trimmed = entry.trim().replace(/^\./, '');
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end !== -1) {
      const host = trimmed.slice(1, end);
      const rest = trimmed.slice(end + 1);
      if (rest.startsWith(':')) return { host: normalizeHostname(host), port: rest.slice(1) };
      return { host: normalizeHostname(host) };
    }
  }

  const colonCount = (trimmed.match(/:/g) ?? []).length;
  if (colonCount === 1) {
    const [host, port] = trimmed.split(':');
    return { host: normalizeHostname(host), port };
  }

  return { host: normalizeHostname(trimmed) };
}

function matchesNoProxyEntry(url: URL, entry: string): boolean {
  const { host, port } = parseNoProxyEntry(entry);
  if (host === '*') return true;

  const hostname = normalizeHostname(url.hostname);
  const urlPort = url.port || undefined;
  if (port && port !== urlPort) return false;
  return hostname === host || hostname.endsWith(`.${host}`);
}

function findProxyUrl(url: URL, env: NodeJS.ProcessEnv): string | undefined {
  const keys = PROXY_ENV_BY_PROTOCOL[url.protocol as 'http:' | 'https:'];
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

function createProxyDispatcher(proxyUrl: string): Dispatcher {
  const cached = proxyDispatcherCache.get(proxyUrl);
  if (cached) return cached;
  const dispatcher = new ProxyAgent(proxyUrl);
  proxyDispatcherCache.set(proxyUrl, dispatcher);
  return dispatcher;
}

function resolveUrl(input: RequestInfo | URL): URL | null {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  if (typeof Request !== 'undefined' && input instanceof Request) return new URL(input.url);
  return null;
}

export function hasProxyEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']
    .some((key) => {
      const value = env[key];
      return typeof value === 'string' && value.trim() !== '';
    });
}

export function decideProxy(url: URL, env: NodeJS.ProcessEnv = process.env): ProxyDecision {
  if (isLoopbackHost(url.hostname)) return { mode: 'direct' };

  const noProxyEntries = effectiveNoProxyEntries(env);
  if (noProxyEntries.some(entry => matchesNoProxyEntry(url, entry))) {
    return { mode: 'direct' };
  }

  const proxyUrl = findProxyUrl(url, env);
  if (!proxyUrl) return { mode: 'direct' };
  return { mode: 'proxy', proxyUrl };
}

export function getDispatcherForUrl(url: URL, env: NodeJS.ProcessEnv = process.env): Dispatcher {
  const decision = decideProxy(url, env);
  if (decision.mode === 'direct' || !decision.proxyUrl) return directDispatcher;
  return createProxyDispatcher(decision.proxyUrl);
}

export async function fetchWithNodeNetwork(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = resolveUrl(input);
  if (!url || !hasProxyEnv()) {
    return nativeFetch(input, init);
  }

  return (await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...init,
    dispatcher: getDispatcherForUrl(url),
  } as Parameters<typeof undiciFetch>[1])) as unknown as Response;
}

export function installNodeNetwork(): void {
  if (installed || !hasProxyEnv()) return;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => (
    fetchWithNodeNetwork(input, init)
  )) as typeof globalThis.fetch;
  installed = true;
}
