/**
 * Polling event source: wraps an opencli command as a periodic event source.
 * Uses setTimeout recursion for dynamic backoff intervals.
 */

import { createHash } from 'node:crypto'
import type { ChannelEvent, EventHandler, EventSource, PollingSourceConfig } from '../types.js'

/** Execute function provided by the watcher (closure over CliCommand). */
export type PollExecuteFn = () => Promise<unknown>

const MAX_SNAPSHOT_KEYS = 100
const MIN_INTERVAL = 30

export class PollingSource implements EventSource {
  readonly type = 'polling'

  private readonly config: PollingSourceConfig
  private readonly execute: PollExecuteFn
  private readonly handlers: EventHandler[] = []
  private previousKeys = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private backoffMultiplier = 1
  private consecutiveErrors = 0
  private stopped = false

  constructor(config: PollingSourceConfig, execute: PollExecuteFn) {
    this.config = config
    this.execute = execute
  }

  onEvent(handler: EventHandler): void {
    this.handlers.push(handler)
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.pollOnce()
    this.scheduleNext()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleNext(): void {
    if (this.stopped) return
    const delayMs = Math.max(this.config.interval, MIN_INTERVAL) * 1000 * this.backoffMultiplier
    this.timer = setTimeout(async () => {
      await this.pollOnce()
      this.scheduleNext()
    }, delayMs)
  }

  /** Execute a single poll cycle. Exposed for testing. */
  async pollOnce(): Promise<void> {
    let result: unknown
    try {
      result = await this.execute()
    } catch (err) {
      this.consecutiveErrors++
      if (this.consecutiveErrors <= 3) {
        this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 10)
      }
      if (this.consecutiveErrors === 1) {
        this.emit({
          id: `${this.config.command}:error:${Date.now()}`,
          source: this.config.command,
          platform: this.config.command.split('/')[0],
          eventType: 'error',
          content: `Polling error for ${this.config.command}: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        })
      }
      return
    }

    this.consecutiveErrors = 0
    this.backoffMultiplier = 1

    if (!Array.isArray(result)) return

    const currentKeys = new Set<string>()
    const newItems: ChannelEvent[] = []

    for (const item of result) {
      if (typeof item !== 'object' || item === null) continue
      const key = this.deriveKey(item as Record<string, unknown>)
      currentKeys.add(key)

      if (!this.previousKeys.has(key)) {
        newItems.push({
          id: `${this.config.command}:${key}`,
          source: this.config.command,
          platform: this.config.command.split('/')[0],
          eventType: 'new_item',
          content: this.formatItem(item as Record<string, unknown>),
          raw: item,
          timestamp: Date.now(),
        })
      }
    }

    this.previousKeys = currentKeys.size <= MAX_SNAPSHOT_KEYS
      ? currentKeys
      : new Set([...currentKeys].slice(0, MAX_SNAPSHOT_KEYS))

    for (const event of newItems) {
      this.emit(event)
    }
  }

  private deriveKey(item: Record<string, unknown>): string {
    if (this.config.dedupField && item[this.config.dedupField] != null) {
      return String(item[this.config.dedupField])
    }
    if (item.id != null) return String(item.id)
    if (item.url != null) return String(item.url)
    if (item.title != null) return String(item.title)
    return createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 16)
  }

  private formatItem(item: Record<string, unknown>): string {
    const parts: string[] = []
    if (item.title) parts.push(String(item.title))
    if (item.description) parts.push(String(item.description))
    if (item.url) parts.push(String(item.url))
    if (item.author || item.user) parts.push(`by ${item.author ?? item.user}`)
    return parts.join('\n') || JSON.stringify(item).slice(0, 200)
  }

  private emit(event: ChannelEvent): void {
    for (const handler of this.handlers) {
      handler(event)
    }
  }
}
