/**
 * Page interface: type-safe abstraction over Playwright MCP browser page.
 *
 * All pipeline steps and CLI adapters should use this interface
 * instead of `any` for browser interactions.
 */

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  /** Set to true when value has been redacted for security logging. */
  _redacted?: boolean;
}

/**
 * Names (case-insensitive) whose values should be treated as secrets.
 * Used by redactCookies() to replace values with '[REDACTED]' in logs/output.
 */
export const SENSITIVE_COOKIE_NAMES = new Set([
  'session', 'sess', 'sid', 'auth', 'token', 'access_token', 'refresh_token',
  'jwt', 'bearer', 'api_key', 'apikey', 'secret', 'password', 'passwd', 'pwd',
  'credential', 'credentials', 'authorization',
  // Common session cookie names used by popular platforms
  'JSESSIONID', 'PHPSESSID', 'ASP.NET_SessionId', '__Secure-next-auth.session-token',
  'supabase-auth-token', '__session', 'connect.sid',
]);

/**
 * Returns true if the cookie name appears to hold a sensitive credential.
 * Matching is case-insensitive and also catches partial matches
 * (e.g. "app_session_id" → true).
 */
export function isSensitiveCookieName(name: string): boolean {
  const lower = name.toLowerCase();
  for (const s of SENSITIVE_COOKIE_NAMES) {
    if (lower === s.toLowerCase() || lower.includes(s.toLowerCase())) return true;
  }
  return false;
}

/**
 * Return a copy of the cookie list with sensitive values replaced by '[REDACTED]'.
 * HttpOnly cookies are always redacted regardless of name, because they are
 * typically session/auth cookies that websites intentionally protect from JS.
 */
export function redactCookies(cookies: BrowserCookie[]): BrowserCookie[] {
  return cookies.map((c) => {
    const shouldRedact = c.httpOnly || isSensitiveCookieName(c.name);
    if (!shouldRedact) return c;
    return { ...c, value: '[REDACTED]', _redacted: true };
  });
}

export interface SnapshotOptions {
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
  raw?: boolean;
  viewportExpand?: number;
  maxTextLength?: number;
}

export interface WaitOptions {
  text?: string;
  selector?: string;   // wait until document.querySelector(selector) matches
  time?: number;
  timeout?: number;
}

export interface ScreenshotOptions {
  format?: 'png' | 'jpeg';
  quality?: number;
  fullPage?: boolean;
  path?: string;
}

export interface BrowserSessionInfo {
  workspace?: string;
  connected?: boolean;
  [key: string]: unknown;
}

export interface IPage {
  goto(url: string, options?: { waitUntil?: 'load' | 'none'; settleMs?: number }): Promise<void>;
  evaluate(js: string): Promise<any>;
  getCookies(opts?: { domain?: string; url?: string }): Promise<BrowserCookie[]>;
  snapshot(opts?: SnapshotOptions): Promise<any>;
  click(ref: string): Promise<void>;
  typeText(ref: string, text: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  scrollTo(ref: string): Promise<any>;
  getFormState(): Promise<any>;
  wait(options: number | WaitOptions): Promise<void>;
  tabs(): Promise<any>;
  closeTab(index?: number): Promise<void>;
  newTab(): Promise<void>;
  selectTab(index: number): Promise<void>;
  networkRequests(includeStatic?: boolean): Promise<any>;
  consoleMessages(level?: string): Promise<any>;
  scroll(direction?: string, amount?: number): Promise<void>;
  autoScroll(options?: { times?: number; delayMs?: number }): Promise<void>;
  installInterceptor(pattern: string): Promise<void>;
  getInterceptedRequests(): Promise<any[]>;
  waitForCapture(timeout?: number): Promise<void>;
  screenshot(options?: ScreenshotOptions): Promise<string>;
  /**
   * Set local file paths on a file input element via CDP DOM.setFileInputFiles.
   * Chrome reads the files directly — no base64 encoding or payload size limits.
   */
  setFileInput?(files: string[], selector?: string): Promise<void>;
  closeWindow?(): Promise<void>;
  /** Returns the current page URL, or null if unavailable. */
  getCurrentUrl?(): Promise<string | null>;
}
