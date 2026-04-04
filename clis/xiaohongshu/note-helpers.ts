/** Side-effect-free helpers shared by xiaohongshu note and comments commands. */

/** Extract a bare note ID from a full URL or raw ID string. */
export function parseNoteId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/(?:explore|note|search_result)\/([a-f0-9]+)/);
  return match ? match[1] : trimmed;
}

/**
 * Build the best navigation URL for a note.
 *
 * XHS blocks direct `/explore/<id>` access without a valid `xsec_token`.
 * When the user passes a full URL (from search results), we preserve it
 * so the browser navigates with the token intact. For bare IDs we now use
 * `/search_result/<id>` which works without xsec_token when cookies are present.
 */
export function buildNoteUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//.test(trimmed)) {
    // Full URL — navigate as-is; the browser will follow any redirects
    return trimmed;
  }
  // Use /search_result/<id> instead of /explore/<id> — works without xsec_token
  // when the user is logged in via cookies (which is always the case with opencli).
  return `https://www.xiaohongshu.com/search_result/${trimmed}`;
}
