/**
 * Daemon authentication token — shared secret between CLI, daemon, and extension.
 *
 * On first run, a random token is generated and stored at ~/.opencli/token.
 * The daemon requires this token on all HTTP and WebSocket connections.
 * The CLI and extension read the file to authenticate.
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TOKEN_DIR = path.join(os.homedir(), '.opencli');
const TOKEN_PATH = path.join(TOKEN_DIR, 'token');
const TOKEN_LENGTH = 32; // 32 random bytes → 64-char hex string

/**
 * Get the current daemon token, creating one if it doesn't exist.
 * Returns the hex-encoded token string.
 */
export function getOrCreateToken(): string {
  // If token file exists and is non-empty, return it
  try {
    const existing = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // File doesn't exist or can't be read — create a new one
  }

  const token = randomBytes(TOKEN_LENGTH).toString('hex');

  // Ensure directory exists
  fs.mkdirSync(TOKEN_DIR, { recursive: true });

  // Write token with restrictive permissions (owner-only read/write)
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });

  return token;
}

/**
 * Read the existing token. Returns null if no token file exists.
 * Used by clients that should not create a token (only the daemon creates it).
 */
export function readToken(): string | null {
  try {
    const token = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
    return token.length >= 32 ? token : null;
  } catch {
    return null;
  }
}

/** Header name used to pass the token */
export const TOKEN_HEADER = 'x-opencli-token';
