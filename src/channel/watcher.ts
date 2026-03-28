/**
 * Watcher engine: manages EventSource lifecycle and routes events to the queue.
 *
 * - Instantiates sources from config
 * - Routes events: source → queue
 * - Provides drain() for the MCP server to push events
 * - Acquires browser lock for COOKIE/UI strategy commands
 */

import type { ChannelConfig, ChannelEvent, EventSource } from './types.js'
import { EventQueue } from './queue.js'
import { PollingSource } from './sources/polling.js'
import { WebhookSource } from './sources/webhook.js'
import { getRegistry, Strategy } from '../registry.js'
import { executeCommand } from '../execution.js'
import { acquireBrowserLock, releaseBrowserLock } from './browser-lock.js'

export class Watcher {
  private readonly sources: EventSource[] = []
  private readonly queue = new EventQueue()
  private readonly eventLog: Array<{ source: string; lastPoll: number; errors: number }> = []

  constructor(private readonly config: ChannelConfig) {}

  /** Initialize and start all configured sources. */
  async start(): Promise<void> {
    const registry = getRegistry()

    // Polling sources
    for (const src of this.config.sources) {
      if (!src.enabled) continue

      // Validate command exists in registry
      const cmd = registry.get(src.command)
      if (!cmd) {
        console.error(`[channel] Warning: command "${src.command}" not found, skipping`)
        continue
      }

      // Enforce minimum interval
      if (src.interval < 30) {
        console.error(`[channel] Warning: interval for "${src.command}" clamped to 30s (was ${src.interval}s)`)
        src.interval = 30
      }

      // Determine if this command needs browser (for lock coordination)
      const needsBrowser = cmd.browser !== false && (
        cmd.strategy === Strategy.COOKIE ||
        cmd.strategy === Strategy.UI ||
        cmd.strategy === Strategy.HEADER
      )

      // Create execute closure that captures the resolved cmd
      const executeFn = async (): Promise<unknown> => {
        if (needsBrowser) {
          if (!acquireBrowserLock()) {
            console.error(`[channel] Browser busy, skipping poll for "${src.command}"`)
            return [] // Skip this cycle — return empty to avoid false diff
          }
          try {
            return await executeCommand(cmd, {})
          } finally {
            releaseBrowserLock()
          }
        }
        return executeCommand(cmd, {})
      }

      const polling = new PollingSource(src, executeFn)
      this.wireSource(polling, src.command)
      this.sources.push(polling)
    }

    // Webhook source
    if (this.config.webhook.enabled) {
      const webhook = new WebhookSource(this.config.webhook)
      this.wireSource(webhook, 'webhook')
      this.sources.push(webhook)
    }

    // Start all
    for (const source of this.sources) {
      await source.start()
    }
  }

  /** Stop all sources. */
  async stop(): Promise<void> {
    for (const source of this.sources) {
      await source.stop()
    }
  }

  /** Drain queued events (called by MCP server to push). */
  drain(): ChannelEvent[] {
    return this.queue.drain()
  }

  /** Number of events waiting. */
  get pendingCount(): number {
    return this.queue.pending
  }

  /** Get source stats for status command. */
  getStats(): Array<{ source: string; lastPoll: number; errors: number }> {
    return [...this.eventLog]
  }

  private wireSource(source: EventSource, name: string): void {
    const logEntry = { source: name, lastPoll: 0, errors: 0 }
    this.eventLog.push(logEntry)

    source.onEvent((event: ChannelEvent) => {
      logEntry.lastPoll = Date.now()
      if (event.eventType === 'error') {
        logEntry.errors++
      }
      this.queue.push(event)
    })
  }
}
