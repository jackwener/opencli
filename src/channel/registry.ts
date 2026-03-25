/**
 * Subscription registry — persists who subscribes to what.
 * File: ~/.opencli/channel/subscriptions.json
 *
 * Uses a lockfile to prevent concurrent CLI invocations from clobbering
 * each other's changes (e.g. two `subscribe` commands in parallel).
 */

import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { readFile, writeFile, rename, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Subscription } from './types.js';

const DEFAULT_PATH = join(homedir(), '.opencli', 'channel', 'subscriptions.json');

export class SubscriptionRegistry {
  private subs: Subscription[] = [];
  private readonly lockPath: string;

  constructor(private readonly path: string = DEFAULT_PATH) {
    this.lockPath = `${path}.lock`;
  }

  /**
   * Atomically load → mutate → save with file locking.
   * Ensures concurrent CLI invocations don't clobber each other.
   */
  async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    mkdirSync(dirname(this.path), { recursive: true });

    // Acquire lock via O_CREAT|O_EXCL (atomic create-or-fail)
    const maxRetries = 50;
    const retryMs = 100;
    let lockFd: Awaited<ReturnType<typeof open>> | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        lockFd = await open(this.lockPath, 'wx');
        break;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
          // Lock held by another process — check if stale (>10s old)
          try {
            const { mtimeMs } = await (await open(this.lockPath, 'r')).stat();
            (await open(this.lockPath, 'r')).close();
            if (Date.now() - mtimeMs > 10_000) {
              // Stale lock — remove and retry
              try { unlinkSync(this.lockPath); } catch {}
              continue;
            }
          } catch {}
          await new Promise(r => setTimeout(r, retryMs));
          continue;
        }
        throw e;
      }
    }

    if (!lockFd) {
      throw new Error(`Failed to acquire lock on ${this.lockPath} after ${maxRetries} retries`);
    }

    try {
      await this._load();
      const result = await fn();
      await this._save();
      return result;
    } finally {
      await lockFd.close();
      try { unlinkSync(this.lockPath); } catch {}
    }
  }

  /** Load without lock (for read-only operations like list/status). */
  async load(): Promise<void> {
    await this._load();
  }

  private async _load(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      this.subs = JSON.parse(raw) as Subscription[];
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.subs = [];
        return;
      }
      throw e;
    }
  }

  async save(): Promise<void> {
    await this._save();
  }

  private async _save(): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.subs, null, 2), 'utf8');
    await rename(tmp, this.path);
  }

  add(origin: string, sink: string, sinkConfig: Record<string, unknown> = {}, intervalMs = 0): Subscription {
    const configKey = JSON.stringify(sinkConfig);
    const existing = this.subs.find(
      s => s.origin === origin && s.sink === sink && JSON.stringify(s.sinkConfig) === configKey,
    );
    if (existing) {
      if (intervalMs !== existing.intervalMs) {
        existing.intervalMs = intervalMs;
      }
      return existing;
    }

    const sub: Subscription = {
      id: randomUUID(),
      origin,
      sink,
      sinkConfig,
      intervalMs,
      createdAt: new Date().toISOString(),
    };
    this.subs.push(sub);
    return sub;
  }

  remove(origin: string): boolean {
    const before = this.subs.length;
    this.subs = this.subs.filter(s => s.origin !== origin);
    return this.subs.length < before;
  }

  removeById(id: string): boolean {
    const before = this.subs.length;
    this.subs = this.subs.filter(s => s.id !== id);
    return this.subs.length < before;
  }

  list(): Subscription[] {
    return [...this.subs];
  }

  origins(): string[] {
    return [...new Set(this.subs.map(s => s.origin))];
  }

  forOrigin(origin: string): Subscription[] {
    return this.subs.filter(s => s.origin === origin);
  }
}
