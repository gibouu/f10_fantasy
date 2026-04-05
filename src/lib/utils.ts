import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ─────────────────────────────────────────────
// Class name merging
// ─────────────────────────────────────────────

/** Merge Tailwind class names, resolving conflicts correctly. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ─────────────────────────────────────────────
// Date / time formatting
// ─────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Format a lock cutoff date for display in the UI.
 * Example output: "Sun 27 Apr · 14:00 UTC"
 */
export function formatLockTime(date: Date): string {
  const day = DAYS[date.getUTCDay()]
  const dayNum = date.getUTCDate()
  const month = MONTHS[date.getUTCMonth()]
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `${day} ${dayNum} ${month} · ${hours}:${minutes} UTC`
}

/**
 * Convert a duration in milliseconds to a human-readable countdown string.
 *
 * - >= 1 hour:  "2h 34m"
 * - < 1 hour:   "45m 12s"
 * - Negative:   "0m 0s" (already expired)
 */
export function msToCountdown(ms: number): string {
  if (ms <= 0) return '0m 0s'

  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours >= 1) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m ${seconds}s`
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────

/**
 * Return an inline CSS `color` style string for a team color hex value.
 *
 * Usage in JSX: `<span style={{ ...getTeamColorStyle('#E8002D') }}>`
 *
 * @param hex - Full hex string with or without '#' prefix
 */
export function getTeamColorClass(hex: string): string {
  const normalized = hex.startsWith('#') ? hex : `#${hex}`
  return `color: ${normalized}`
}

/**
 * Pluralize a word based on count.
 *
 * @param count    - The quantity to base pluralization on
 * @param singular - Singular form of the word
 * @param plural   - Plural form (defaults to `singular + "s"`)
 *
 * @example pluralize(1, 'race') → "1 race"
 * @example pluralize(3, 'race') → "3 races"
 * @example pluralize(1, 'penalty', 'penalties') → "1 penalty"
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count} ${word}`
}
