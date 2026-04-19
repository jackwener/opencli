import { cli, Strategy } from '@jackwener/opencli/registry';
import { extractChapters, extractChapterContent } from './utils.js';
import {
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  unlinkSync,
  openSync,
  closeSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

// ----------------------------------------------------------------------------
// Paths
// ----------------------------------------------------------------------------
const LOCK_DIR = resolve(homedir(), '.opencli', 'locks');
const LOCK_PATH = resolve(LOCK_DIR, '99csw.lock');
const STALE_LOCK_MS = 6 * 60 * 60 * 1000; // 6 hours

function expandPath(p) {
  if (!p) return '';
  return p.startsWith('~') ? resolve(homedir(), p.slice(2)) : resolve(p);
}

// ----------------------------------------------------------------------------
// Cross-process serial lock (so parallel invocations queue, not collide)
// ----------------------------------------------------------------------------
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // EPERM = exists but not ours
  }
}

function readLockInfo() {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function tryReclaimStaleLock() {
  if (!existsSync(LOCK_PATH)) return false;
  const info = readLockInfo();
  const mtime = (() => { try { return statSync(LOCK_PATH).mtimeMs; } catch { return 0; } })();
  const stale = Date.now() - mtime > STALE_LOCK_MS;
  const dead = info && !isPidAlive(info.pid);
  if (dead || stale) {
    try { unlinkSync(LOCK_PATH); } catch {}
    console.log(`Reclaimed stale lock (pid=${info?.pid}, dead=${dead}, stale=${stale}).`);
    return true;
  }
  return false;
}

async function acquireLock(bookId, maxWaitMs) {
  mkdirSync(LOCK_DIR, { recursive: true });
  const start = Date.now();
  let lastNoticeAt = 0;
  while (true) {
    try {
      const fd = openSync(LOCK_PATH, 'wx');
      const payload = JSON.stringify({
        pid: process.pid,
        bookId,
        started: new Date().toISOString(),
      });
      writeFileSync(fd, payload);
      closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (tryReclaimStaleLock()) continue;

      if (Date.now() - start > maxWaitMs) {
        const info = readLockInfo();
        throw new Error(
          `Lock wait timeout after ${Math.round(maxWaitMs / 1000)}s (held by PID ${info?.pid}, book=${info?.bookId}).`
        );
      }

      if (Date.now() - lastNoticeAt > 15000) {
        const info = readLockInfo();
        console.log(`Waiting for another 99csw download to finish (PID ${info?.pid}, book=${info?.bookId})...`);
        lastNoticeAt = Date.now();
      }
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

function releaseLock() {
  try {
    if (!existsSync(LOCK_PATH)) return;
    const info = readLockInfo();
    if (info && info.pid === process.pid) unlinkSync(LOCK_PATH);
  } catch { /* best effort */ }
}

// Release lock on Ctrl+C / kill. Idempotent — only releases our own lock.
let signalsInstalled = false;
function installSignalHandlers() {
  if (signalsInstalled) return;
  signalsInstalled = true;
  const handler = (sig) => {
    releaseLock();
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', () => handler('SIGINT'));
  process.once('SIGTERM', () => handler('SIGTERM'));
}

// ----------------------------------------------------------------------------
// Checkpoint (resume support)
// ----------------------------------------------------------------------------
function loadCheckpoint(ckptPath, bookId) {
  if (!ckptPath || !existsSync(ckptPath)) return new Set();
  try {
    const ckpt = JSON.parse(readFileSync(ckptPath, 'utf-8'));
    if (ckpt.bookId && ckpt.bookId !== bookId) {
      throw new Error(
        `Checkpoint bookId=${ckpt.bookId} conflicts with requested bookId=${bookId}. ` +
        `Use a different --output or delete ${ckptPath}.`
      );
    }
    return new Set(ckpt.doneChapterIds || []);
  } catch (err) {
    if (err.message.includes('conflicts')) throw err;
    console.log(`Warning: could not read checkpoint (${err.message}). Starting fresh.`);
    return new Set();
  }
}

function saveCheckpoint(ckptPath, bookId, doneIds, total) {
  writeFileSync(ckptPath, JSON.stringify({
    bookId,
    total,
    doneChapterIds: [...doneIds],
    updated: new Date().toISOString(),
  }, null, 2));
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------
cli({
  site: '99csw',
  name: 'full',
  description: 'Download complete book content from 99csw.com (resume-capable; serial queue across parallel agents)',
  domain: 'www.99csw.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    {
      name: 'book_id',
      type: 'string',
      required: true,
      positional: true,
      help: 'Book ID (e.g., 9210)',
    },
    {
      name: 'limit',
      type: 'int',
      default: 50,
      help: 'Maximum number of chapters to download (default: 50)',
    },
    {
      name: 'skip',
      type: 'int',
      default: 0,
      help: 'Number of chapters to skip from the beginning',
    },
    {
      name: 'output',
      type: 'string',
      default: '',
      help: 'Path to save book content (enables resume via sidecar .ckpt file). Example: ~/Desktop/book.txt',
    },
    {
      name: 'lock_timeout',
      type: 'int',
      default: 3600,
      help: 'Max seconds to wait for another 99csw download to finish (default: 3600 = 1h)',
    },
    {
      name: 'no_lock',
      type: 'boolean',
      default: false,
      help: 'Skip the cross-process queue lock (expert; risks collisions with parallel runs)',
    },
  ],
  columns: ['chapter_num', 'title', 'content_preview', 'status'],
  func: async (page, kwargs) => {
    if (!page) throw new Error('Browser required for 99csw.com (Cloudflare protection)');

    const bookId = kwargs.book_id;
    const limit = kwargs.limit ?? 50;
    const skip = kwargs.skip ?? 0;
    const output = expandPath(kwargs.output || '');
    const ckptPath = output ? output + '.ckpt' : '';
    const useLock = !(kwargs.no_lock ?? false);
    const lockTimeoutMs = (kwargs.lock_timeout ?? 3600) * 1000;

    installSignalHandlers();

    // --- Serial queue lock -----------------------------------------------
    if (useLock) {
      await acquireLock(bookId, lockTimeoutMs);
    }

    try {
      // --- Load checkpoint if present -----------------------------------
      let doneIds = new Set();
      let resuming = false;
      if (output) {
        doneIds = loadCheckpoint(ckptPath, bookId);
        if (doneIds.size > 0) {
          resuming = true;
          console.log(`Resuming: ${doneIds.size} chapters already in ${output}`);
        } else if (existsSync(output)) {
          // No ckpt + existing output = previous run completed or aborted-without-ckpt.
          // Truncate to start fresh.
          writeFileSync(output, '', 'utf-8');
        }
      }

      // --- Fetch index --------------------------------------------------
      const indexUrl = `https://www.99csw.com/book/${bookId}/index.htm`;
      await page.goto(indexUrl);
      await page.wait(2);
      const indexHtml = await page.evaluate(`() => {
        return document.documentElement.outerHTML;
      }`);
      const chapters = extractChapters(indexHtml);
      if (chapters.length === 0) {
        throw new Error('No chapters found. Please check if the book_id is correct.');
      }

      if (output) mkdirSync(dirname(output), { recursive: true });

      const selectedChapters = chapters.slice(skip, skip + limit);
      const total = selectedChapters.length;
      const remaining = selectedChapters.filter(ch => !doneIds.has(ch.id)).length;

      console.log(
        `Book ${bookId}: ${chapters.length} chapters total. ` +
        `Selected ${total}. Already done ${total - remaining}. Downloading ${remaining}.`
      );

      const results = [];

      // Seed already-done chapters into the result set for reporting
      for (let i = 0; i < selectedChapters.length; i++) {
        const ch = selectedChapters[i];
        if (doneIds.has(ch.id)) {
          results.push({
            chapter_num: skip + i + 1,
            title: ch.title,
            content_preview: '(from checkpoint)',
            status: 'Resumed',
          });
        }
      }

      for (let i = 0; i < selectedChapters.length; i++) {
        const ch = selectedChapters[i];
        if (doneIds.has(ch.id)) continue;

        const contentUrl = `https://www.99csw.com/book/${bookId}/${ch.id}.htm`;
        try {
          await page.goto(contentUrl);
          await page.wait(1);
          const contentHtml = await page.evaluate(`() => {
            return document.documentElement.outerHTML;
          }`);
          const content = extractChapterContent(contentHtml);
          const chapterTitle = content.title || ch.title;
          const body = content.body || '';
          const preview = body.substring(0, 100);

          // Append this chapter to the output file immediately, then checkpoint.
          if (output) {
            appendFileSync(output, `\n\n===== ${chapterTitle} =====\n\n${body}`, 'utf-8');
            doneIds.add(ch.id);
            saveCheckpoint(ckptPath, bookId, doneIds, total);
          }

          results.push({
            chapter_num: skip + i + 1,
            title: chapterTitle,
            content_preview: preview + (body.length > 100 ? '...' : ''),
            status: 'Downloaded',
          });

          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          results.push({
            chapter_num: skip + i + 1,
            title: ch.title,
            content_preview: '',
            status: `Error: ${err.message}`,
          });
        }
      }

      // --- Finalize ----------------------------------------------------
      if (output) {
        const allDone = selectedChapters.every(ch => doneIds.has(ch.id));
        if (allDone) {
          try { if (existsSync(ckptPath)) unlinkSync(ckptPath); } catch {}
          console.log(`\n✓ Book saved to: ${output}`);
          console.log(`✓ Checkpoint cleared (download complete).`);
        } else {
          console.log(`\n⚠ Partial completion. Checkpoint kept at: ${ckptPath}`);
          console.log(`  Re-run the same command to resume.`);
        }
      }

      results.sort((a, b) => a.chapter_num - b.chapter_num);
      return results;
    } catch (err) {
      throw new Error(`Error downloading book: ${err.message}`);
    } finally {
      if (useLock) releaseLock();
    }
  },
});
