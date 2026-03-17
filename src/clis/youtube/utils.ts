/**
 * Shared YouTube utilities — URL parsing, video ID extraction, etc.
 */

/**
 * Extract a YouTube video ID from a URL or bare video ID string.
 * Supports: watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/
 */
export function parseVideoId(input: string): string {
  if (!input.startsWith('http')) return input;

  try {
    const parsed = new URL(input);
    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v')!;
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0];
    }
    // Handle /shorts/xxx, /embed/xxx, /live/xxx, /v/xxx
    const pathMatch = parsed.pathname.match(/^\/(shorts|embed|live|v)\/([^/?]+)/);
    if (pathMatch) return pathMatch[2];
  } catch {
    // Not a valid URL — treat entire input as video ID
  }

  return input;
}
