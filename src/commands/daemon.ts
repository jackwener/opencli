/**
 * CLI command for daemon lifecycle:
 *   opencli daemon stop — graceful shutdown
 */

import { fetchDaemonStatus, requestDaemonShutdown } from '../browser/daemon-client.js';
import { log } from '../logger.js';

export async function daemonStop(): Promise<void> {
  const status = await fetchDaemonStatus();
  if (!status) {
    log.info('Daemon is not running.');
    return;
  }

  const ok = await requestDaemonShutdown();
  if (ok) {
    log.success('Daemon stopped.');
  } else {
    log.error('Failed to stop daemon.');
    process.exitCode = 1;
  }
}
