/**
 * Cross-process browser lock for coordinating browser access between
 * the channel watcher and the main opencli CLI process.
 *
 * Lock file: ~/.opencli/browser.lock
 * If the lock is held, watcher skips the poll cycle and retries next interval.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const LOCK_PATH = path.join(os.homedir(), '.opencli', 'browser.lock')
const STALE_TIMEOUT = 120_000 // 2 minutes — if lock older than this, treat as stale

interface BrowserLockData {
  pid: number
  acquiredAt: number
}

/** Try to acquire the browser lock. Returns true if acquired, false if held. */
export function acquireBrowserLock(): boolean {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf-8')
    const data: BrowserLockData = JSON.parse(raw)
    // Check if holder is alive and lock is not stale
    try {
      process.kill(data.pid, 0)
      if (Date.now() - data.acquiredAt < STALE_TIMEOUT) {
        return false // Lock is actively held
      }
    } catch {
      // Holder process is dead — stale lock
    }
  } catch {
    // No lock file — proceed
  }

  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true })
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }))
  return true
}

/** Release the browser lock (only if we own it). */
export function releaseBrowserLock(): void {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf-8')
    const data: BrowserLockData = JSON.parse(raw)
    if (data.pid === process.pid) {
      fs.unlinkSync(LOCK_PATH)
    }
  } catch {
    // Already gone — no-op
  }
}
