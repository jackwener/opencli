/**
 * Manages daemon idle timeout with dual-condition logic:
 * exits only when BOTH CLI is idle AND Extension is disconnected.
 */
export class IdleManager {
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _lastCliRequestTime = Date.now();
  private _extensionConnected = false;
  private _timeoutMs: number;
  private _onExit: () => void;

  constructor(timeoutMs: number, onExit: () => void) {
    this._timeoutMs = timeoutMs;
    this._onExit = onExit;
  }

  get lastCliRequestTime(): number {
    return this._lastCliRequestTime;
  }

  /** Call when an HTTP request arrives from CLI */
  onCliRequest(): void {
    this._lastCliRequestTime = Date.now();
    this._resetTimer();
  }

  /** Call when Extension WebSocket connects or disconnects */
  setExtensionConnected(connected: boolean): void {
    this._extensionConnected = connected;
    if (connected) {
      this._clearTimer();
    } else {
      this._resetTimer();
    }
  }

  private _clearTimer(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _resetTimer(): void {
    this._clearTimer();

    if (this._timeoutMs <= 0) return;
    if (this._extensionConnected) return;

    const elapsed = Date.now() - this._lastCliRequestTime;
    if (elapsed >= this._timeoutMs) {
      this._onExit();
      return;
    }

    this._timer = setTimeout(() => {
      this._onExit();
    }, this._timeoutMs - elapsed);
  }
}
