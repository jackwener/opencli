/**
 * OpenCLI — Offscreen Document (WebSocket host).
 *
 * Lives in an Offscreen document which Chrome never suspends, so the
 * WebSocket connection survives across Service Worker sleep/wake cycles.
 *
 * Message protocol with background.ts:
 *
 *   background → offscreen:
 *     { type: 'ws-connect' }           — (re-)establish WS connection
 *     { type: 'ws-send', payload: str} — send a raw string over WS
 *     { type: 'ws-status' }            — query connection state
 *
 *   offscreen → background:
 *     { type: 'ws-message', data: str }     — incoming WS frame
 *     { type: 'ws-status-reply', connected: bool, reconnecting: bool }
 *     { type: 'log', level, msg, ts }       — forward console output
 */

import { DAEMON_WS_URL, WS_RECONNECT_BASE_DELAY, WS_RECONNECT_MAX_DELAY } from './protocol';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let pendingFrames: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushingFrames = false;

const MAX_EAGER_ATTEMPTS = 6;
const FRAME_RETRY_DELAY = 1000;
const MAX_PENDING_FRAMES = 100;

// ─── Logging ─────────────────────────────────────────────────────────

function sendLog(level: 'info' | 'warn' | 'error', msg: string): void {
  chrome.runtime.sendMessage({ type: 'log', level, msg, ts: Date.now() }).catch(() => {/* SW may be asleep */});
}

const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);

console.log = (...args: unknown[]) => {
  _origLog(...args);
  sendLog('info', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
};
console.warn = (...args: unknown[]) => {
  _origWarn(...args);
  sendLog('warn', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
};
console.error = (...args: unknown[]) => {
  _origError(...args);
  sendLog('error', args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
};

// ─── WebSocket ───────────────────────────────────────────────────────

async function probeDaemon(): Promise<boolean> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'ws-probe' }) as { ok?: boolean };
    return resp?.ok === true;
  } catch {
    return false;
  }
}

async function connect(): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  // Offscreen cannot probe localhost directly, so ask the background SW to do it.
  // This preserves the previous "don't spam console with refused WS connects" guard.
  if (!(await probeDaemon())) {
    scheduleReconnect();
    return;
  }

  try {
    ws = new WebSocket(DAEMON_WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[opencli/offscreen] Connected to daemon');
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws?.send(JSON.stringify({ type: 'hello', version: chrome.runtime.getManifest().version }));
    void flushPendingFrames();
  };

  ws.onmessage = (event) => {
    if (pendingFrames.length >= MAX_PENDING_FRAMES) {
      console.warn('[opencli/offscreen] pendingFrames at capacity, dropping oldest frame');
      pendingFrames.shift();
    }
    pendingFrames.push(event.data as string);
    void flushPendingFrames();
  };

  ws.onclose = () => {
    console.log('[opencli/offscreen] Disconnected from daemon');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingFrames();
  }, FRAME_RETRY_DELAY);
}

async function flushPendingFrames(): Promise<void> {
  if (flushingFrames || pendingFrames.length === 0) return;
  flushingFrames = true;
  try {
    while (pendingFrames.length > 0) {
      let delivered = false;
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'ws-message',
          data: pendingFrames[0],
        }) as { ok?: boolean };
        delivered = resp?.ok === true;
      } catch {
        delivered = false;
      }

      if (!delivered) {
        scheduleFlush();
        break;
      }

      pendingFrames.shift();
    }
  } finally {
    flushingFrames = false;
    if (pendingFrames.length > 0 && !flushTimer) scheduleFlush();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectAttempts++;
  if (reconnectAttempts > MAX_EAGER_ATTEMPTS) return;
  const delay = Math.min(WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1), WS_RECONNECT_MAX_DELAY);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

// ─── Message listener (from background) ─────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ws-connect') {
    reconnectTimer = null;
    reconnectAttempts = 0;
    void connect();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'ws-send') {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(msg.payload as string);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'WebSocket not open' });
    }
    return false;
  }

  if (msg?.type === 'ws-status') {
    sendResponse({
      type: 'ws-status-reply',
      connected: ws?.readyState === WebSocket.OPEN,
      reconnecting: reconnectTimer !== null,
    });
    return false;
  }

  return false;
});

// ─── Boot ────────────────────────────────────────────────────────────

void connect();
console.log('[opencli/offscreen] Offscreen document ready');
