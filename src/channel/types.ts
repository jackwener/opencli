/**
 * Channel module types: events, config, and event source interface.
 */

/** A platform event to be pushed to the AI session. */
export interface ChannelEvent {
  /** Dedup key: "twitter/notifications:1234567" */
  id: string
  /** Source command: "twitter/notifications" */
  source: string
  /** Platform name: "twitter" */
  platform: string
  /** Event type: "new_mention", "new_post", "new_dm", etc. */
  eventType: string
  /** Human-readable summary of the event */
  content: string
  /** Original data from the command result */
  raw?: unknown
  /** Epoch ms when the event was detected */
  timestamp: number
}

/** Configuration for a single polling source. */
export interface PollingSourceConfig {
  type: 'polling'
  /** opencli command full name, e.g. "twitter/notifications" */
  command: string
  /** Poll interval in seconds (minimum 30) */
  interval: number
  /** Whether this source is active */
  enabled: boolean
  /** Override field name for dedup key derivation */
  dedupField?: string
}

/** Configuration for the webhook receiver. */
export interface WebhookConfig {
  enabled: boolean
  /** HTTP port (default 8788, localhost only) */
  port: number
  /** Bearer token for auth. Empty string = no auth. Supports $ENV_VAR syntax. */
  token: string
}

/** Top-level channel configuration (channel.yaml). */
export interface ChannelConfig {
  sources: PollingSourceConfig[]
  webhook: WebhookConfig
}

/** Handler called when an event source produces a new event. */
export type EventHandler = (event: ChannelEvent) => void

/** Pluggable event source interface (strategy pattern). */
export interface EventSource {
  readonly type: string
  start(): Promise<void>
  stop(): Promise<void>
  onEvent(handler: EventHandler): void
}
