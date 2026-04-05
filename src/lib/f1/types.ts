/**
 * Internal normalized F1 data types.
 *
 * These types represent a clean, provider-agnostic data model.
 * They MUST NOT be leaked outside the `src/lib/f1` package — consumer
 * code should work with the domain types in `src/types/domain.ts`.
 */

// ─────────────────────────────────────────────
// Season
// ─────────────────────────────────────────────

export type NormalizedSeason = {
  year: number
  totalRounds: number
}

// ─────────────────────────────────────────────
// Meeting (i.e. Grand Prix weekend)
// ─────────────────────────────────────────────

export type NormalizedMeeting = {
  meetingKey: number
  name: string
  circuitName: string
  country: string
  year: number
}

// ─────────────────────────────────────────────
// Session (individual track session within a meeting)
// ─────────────────────────────────────────────

export type NormalizedSession = {
  sessionKey: number
  meetingKey: number
  /** Canonical session type — mapped from the provider's free-form name */
  type: 'Race' | 'Sprint' | 'Qualifying' | 'Practice'
  scheduledStartUtc: Date
  status: 'upcoming' | 'active' | 'finished'
}

// ─────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────

export type NormalizedDriver = {
  driverNumber: number
  code: string
  firstName: string
  lastName: string
  teamName: string
  /** Full hex color string including # prefix, e.g. "#E8002D" */
  teamColor: string
  photoUrl: string | null
}

// ─────────────────────────────────────────────
// Live position data
// ─────────────────────────────────────────────

export type NormalizedPosition = {
  driverNumber: number
  position: number
  date: Date
}

export type NormalizedLiveClassification = {
  sessionKey: number
  capturedAt: Date
  positions: Array<{
    driverNumber: number
    position: number
  }>
}

// ─────────────────────────────────────────────
// Final race results
// ─────────────────────────────────────────────

export type NormalizedFinalResult = {
  driverNumber: number
  /** null if driver did not start or was excluded before a classified position was set */
  position: number | null
  status: 'CLASSIFIED' | 'DNF' | 'DNS' | 'DSQ'
}
