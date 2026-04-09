import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DAEMON_HOST,
  getDaemonBaseUrl,
  getDaemonConnectHost,
  getDaemonConfigPath,
  parseDaemonConfig,
  resolveDaemonConfig,
} from './daemon-config.js';

describe('daemon-config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses defaults when file config is empty', () => {
    expect(resolveDaemonConfig({}, {})).toEqual({
      host: DEFAULT_DAEMON_HOST,
      port: 19825,
    });
  });

  it('prefers environment variables over file config', () => {
    expect(resolveDaemonConfig({
      OPENCLI_DAEMON_HOST: '0.0.0.0',
      OPENCLI_DAEMON_PORT: '28888',
    }, {
      host: '127.0.0.1',
      port: 19825,
    })).toEqual({
      host: '0.0.0.0',
      port: 28888,
    });
  });

  it('keeps host when it is already connectable', () => {
    expect(resolveDaemonConfig({}, { host: '192.168.1.2', port: 28888 })).toEqual({
      host: '192.168.1.2',
      port: 28888,
    });
  });

  it('parses daemon.yaml content', () => {
    expect(parseDaemonConfig(`
host: 0.0.0.0
port: 29876
`)).toEqual({
      host: '0.0.0.0',
      port: 29876,
    });
  });

  it('ignores malformed config values', () => {
    expect(parseDaemonConfig(`
host: 123
port: nope
`)).toEqual({});
  });

  it('maps wildcard hosts to loopback for client connections', () => {
    expect(getDaemonConnectHost('0.0.0.0')).toBe('127.0.0.1');
    expect(getDaemonConnectHost('::')).toBe('[::1]');
    expect(getDaemonConnectHost('192.168.1.8')).toBe('192.168.1.8');
  });

  it('builds the client base url from the normalized host and port', () => {
    expect(getDaemonBaseUrl({
      host: '0.0.0.0',
      port: 29876,
    })).toBe('http://127.0.0.1:29876');
  });

  it('resolves the daemon config path from the home directory', () => {
    expect(getDaemonConfigPath('/tmp/demo')).toBe('/tmp/demo/.opencli/daemon.yaml');
  });
});
