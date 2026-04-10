/**
 * CLI command for daemon lifecycle:
 *   opencli daemon stop — graceful shutdown
 */

import chalk from 'chalk';
import { fetchDaemonStatus, requestDaemonShutdown } from '../browser/daemon-client.js';

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
