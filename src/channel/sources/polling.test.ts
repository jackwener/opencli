import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PollingSource } from './polling.js'
import type { ChannelEvent, PollingSourceConfig } from '../types.js'

const config: PollingSourceConfig = {
  type: 'polling',
  command: 'test/items',
  interval: 1,
  enabled: true,
}

describe('PollingSource', () => {
  let source: PollingSource
  let executeFn: ReturnType<typeof vi.fn<() => Promise<unknown>>>
  let events: ChannelEvent[]

  beforeEach(() => {
    events = []
    executeFn = vi.fn()
    source = new PollingSource(config, executeFn)
    source.onEvent((e) => events.push(e))
  })

  afterEach(async () => {
    await source.stop()
  })

  it('has correct type', () => {
    expect(source.type).toBe('polling')
  })

  it('detects new items on first poll', async () => {
    executeFn.mockResolvedValue([
      { id: '1', title: 'Hello' },
      { id: '2', title: 'World' },
    ])
    await source.pollOnce()
    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('test/items:1')
  })

  it('only emits new items on subsequent polls', async () => {
    executeFn.mockResolvedValue([{ id: '1', title: 'Hello' }])
    await source.pollOnce()
    events.length = 0

    executeFn.mockResolvedValue([
      { id: '1', title: 'Hello' },
      { id: '2', title: 'New' },
    ])
    await source.pollOnce()
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('test/items:2')
  })

  it('handles non-array results gracefully', async () => {
    executeFn.mockResolvedValue('not an array')
    await source.pollOnce()
    expect(events).toHaveLength(0)
  })

  it('handles execution errors without throwing', async () => {
    executeFn.mockRejectedValue(new Error('network error'))
    await expect(source.pollOnce()).resolves.not.toThrow()
  })

  it('uses custom dedupField when configured', async () => {
    const customSource = new PollingSource(
      { ...config, dedupField: 'bvid' },
      executeFn,
    )
    customSource.onEvent((e) => events.push(e))

    executeFn.mockResolvedValue([{ bvid: 'BV123', title: 'Video' }])
    await customSource.pollOnce()
    expect(events[0].id).toBe('test/items:BV123')
  })

  it('derives dedup key with priority: id > url > title > hash', async () => {
    executeFn.mockResolvedValue([
      { url: 'https://example.com', title: 'Page' },
    ])
    await source.pollOnce()
    expect(events[0].id).toBe('test/items:https://example.com')
  })
})
