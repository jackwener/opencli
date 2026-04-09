/**
 * CLI commands for daemon lifecycle management:
 *   opencli daemon status  — show daemon state
 *   opencli daemon stop    — graceful shutdown
 *   opencli daemon restart — stop + respawn
 */

import chalk from 'chalk';
import { loadDaemonConfig, saveDaemonConfig, type DaemonFileConfig, getDaemonConfigPath } from '../daemon-config.js';
import { fetchDaemonStatus, requestDaemonShutdown } from '../browser/daemon-client.js';
import { formatDuration } from '../download/progress.js';

function formatTimeSince(timestampMs: number): string {
  const seconds = (Date.now() - timestampMs) / 1000;
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export async function daemonStatus(): Promise<void> {
  const status = await fetchDaemonStatus();
  if (!status) {
    console.log(`Daemon: ${chalk.dim('not running')}`);
    return;
  }

  console.log(`Daemon: ${chalk.green('running')} (PID ${status.pid})`);
  console.log(`Uptime: ${formatDuration(Math.round(status.uptime * 1000))}`);
  console.log(`Extension: ${status.extensionConnected ? chalk.green('connected') : chalk.yellow('disconnected')}`);
  console.log(`Last CLI request: ${formatTimeSince(status.lastCliRequestTime)}`);
  console.log(`Memory: ${status.memoryMB} MB`);
  console.log(`Host: ${status.host}`);
  console.log(`Port: ${status.port}`);
}

export async function daemonStop(): Promise<void> {
  const status = await fetchDaemonStatus();
  if (!status) {
    console.log(chalk.dim('Daemon is not running.'));
    return;
  }

  const ok = await requestDaemonShutdown();
  if (ok) {
    console.log(chalk.green('Daemon stopped.'));
  } else {
    console.error(chalk.red('Failed to stop daemon.'));
    process.exitCode = 1;
  }
}

export async function daemonRestart(): Promise<void> {
  const status = await fetchDaemonStatus();
  if (status) {
    const ok = await requestDaemonShutdown();
    if (!ok) {
      console.error(chalk.red('Failed to stop daemon.'));
      process.exitCode = 1;
      return;
    }
    // Wait for daemon to actually exit (poll until unreachable)
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
      if (!(await fetchDaemonStatus())) break;
    }
  }

  // Import BrowserBridge to spawn a new daemon
  const { BrowserBridge } = await import('../browser/bridge.js');
  const bridge = new BrowserBridge();
  try {
    console.log('Starting daemon...');
    await bridge.connect({ timeout: 10 });
    console.log(chalk.green('Daemon restarted.'));
  } catch (err) {
    console.error(chalk.red(`Failed to restart daemon: ${err instanceof Error ? err.message : err}`));
    process.exitCode = 1;
  }
}

export function daemonConfigGet(): void {
  const config = loadDaemonConfig();
  const configPath = getDaemonConfigPath();
  if (config.host === undefined && config.port === undefined) {
    console.log(chalk.dim(`No daemon config found at ${configPath}`));
    return;
  }

  console.log(`Config: ${configPath}`);
  if (config.host !== undefined) console.log(`Host: ${config.host}`);
  if (config.port !== undefined) console.log(`Port: ${config.port}`);
}

export function daemonConfigSet(opts: { host?: string; port?: string | number }): void {
  const current = loadDaemonConfig();
  const next: DaemonFileConfig = { ...current };

  if (typeof opts.host === 'string' && opts.host.trim()) {
    next.host = opts.host.trim();
  }
  if (opts.port !== undefined) {
    const parsed = Number.parseInt(String(opts.port), 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      console.error(chalk.red(`Invalid port: ${opts.port}`));
      process.exitCode = 1;
      return;
    }
    next.port = parsed;
  }

  saveDaemonConfig(next);
  console.log(chalk.green(`Saved daemon config to ${getDaemonConfigPath()}`));
}

export function daemonConfigUnset(opts: { host?: boolean; port?: boolean }): void {
  const current = loadDaemonConfig();
  const next: DaemonFileConfig = { ...current };
  if (opts.host) delete next.host;
  if (opts.port) delete next.port;
  saveDaemonConfig(next);
  console.log(chalk.green(`Updated daemon config at ${getDaemonConfigPath()}`));
}
