/**
 * Shared utilities for CLI adapters.
 */

/**
 * Pause for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clamp a numeric value to [min, max].
 * Falls back to defaultVal when value is falsy (0, NaN, undefined coerced to 0).
 * Matches the convention used across adapters where 0 means "not provided".
 */
export function clampToRange(value: number, defaultVal: number, min: number, max: number): number {
  return Math.max(min, Math.min(value || defaultVal, max));
}
