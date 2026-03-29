import { a as DAEMON_WS_URL, W as WS_RECONNECT_BASE_DELAY, b as WS_RECONNECT_MAX_DELAY } from './assets/protocol-Z52ThYIj.js';

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let pendingFrames = [];
let flushTimer = null;
let flushingFrames = false;
const MAX_EAGER_ATTEMPTS = 6;
const FRAME_RETRY_DELAY = 1e3;
function sendLog(level, msg) {
  chrome.runtime.sendMessage({ type: "log", level, msg, ts: Date.now() }).catch(() => {
  });
}
const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log = (...args) => {
  _origLog(...args);
  sendLog("info", args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
};
console.warn = (...args) => {
  _origWarn(...args);
  sendLog("warn", args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
};
console.error = (...args) => {
  _origError(...args);
  sendLog("error", args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
};
async function probeDaemon() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "ws-probe" });
    return resp?.ok === true;
  } catch {
    return false;
  }
}
async function connect() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
  if (!await probeDaemon()) {
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
    console.log("[opencli/offscreen] Connected to daemon");
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws?.send(JSON.stringify({ type: "hello", version: chrome.runtime.getManifest().version }));
    void flushPendingFrames();
  };
  ws.onmessage = (event) => {
    pendingFrames.push(event.data);
    void flushPendingFrames();
  };
  ws.onclose = () => {
    console.log("[opencli/offscreen] Disconnected from daemon");
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    ws?.close();
  };
}
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingFrames();
  }, FRAME_RETRY_DELAY);
}
async function flushPendingFrames() {
  if (flushingFrames || pendingFrames.length === 0) return;
  flushingFrames = true;
  try {
    while (pendingFrames.length > 0) {
      let delivered = false;
      try {
        const resp = await chrome.runtime.sendMessage({
          type: "ws-message",
          data: pendingFrames[0]
        });
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
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempts++;
  if (reconnectAttempts > MAX_EAGER_ATTEMPTS) return;
  const delay = Math.min(WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1), WS_RECONNECT_MAX_DELAY);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ws-connect") {
    reconnectTimer = null;
    reconnectAttempts = 0;
    void connect();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "ws-send") {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(msg.payload);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "WebSocket not open" });
    }
    return false;
  }
  if (msg?.type === "ws-status") {
    sendResponse({
      type: "ws-status-reply",
      connected: ws?.readyState === WebSocket.OPEN,
      reconnecting: reconnectTimer !== null
    });
    return false;
  }
  return false;
});
void connect();
console.log("[opencli/offscreen] Offscreen document ready");
