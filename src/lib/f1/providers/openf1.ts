/**
 * Concrete OpenF1 API provider.
 *
 * Docs: https://openf1.org
 * Base URL: https://api.openf1.org/v1
 * Auth: none required
 */

import type { F1ProviderAdapter } from '../adapter'
import type {
  NormalizedMeeting,
  NormalizedSession,
  NormalizedDriver,
  NormalizedLiveClassification,
  NormalizedFinalResult,
} from '../types'

// ─────────────────────────────────────────────
// Raw OpenF1 response shapes
// ─────────────────────────────────────────────

interface OpenF1Meeting {
  meeting_key: number
  meeting_name: string
  circuit_short_name: string
  country_name: string
  year: number
  [key: string]: unknown
}

interface OpenF1Session {
  session_key: number
  meeting_key: number
  /** Free-form name: "Race", "Sprint", "Qualifying", "Practice 1", etc. */
  session_name: string
  session_type: string
  date_start: string
  date_end?: string
  [key: string]: unknown
}

interface OpenF1Driver {
  driver_number: number
  name_acronym: string
  first_name: string
  last_name: string
  team_name: string
  /** Hex color WITHOUT the # prefix, e.g. "E8002D" */
  team_colour: string
  headshot_url: string | null
  [key: string]: unknown
}

interface OpenF1Position {
  session_key: number
  driver_number: number
  position: number
  /** ISO 8601 timestamp string */
  date: string
  [key: string]: unknown
}

interface OpenF1Stint {
  session_key: number
  driver_number: number
  /** First lap of this stint */
  lap_start: number
  /** Last lap completed in this stint */
  lap_end: number
  [key: string]: unknown
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const BASE_URL =
  process.env.OPENF1_BASE_URL ?? 'https://api.openf1.org/v1'

/**
 * Fetch a JSON array from an OpenF1 endpoint.
 * Throws a descriptive Error on non-2xx responses or network failures.
 */
async function openF1Fetch<T>(path: string): Promise<T[]> {
  const url = `${BASE_URL}${path}`
  let res: Response

  try {
    res = await fetch(url, {
      // Disable Next.js fetch cache so we always get fresh data for live sessions.
      // Callers that want caching should wrap this with their own revalidation.
      next: { revalidate: 0 },
    })
  } catch (err) {
    throw new Error(
      `OpenF1 network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new Error(
      `OpenF1 HTTP ${res.status} ${res.statusText} for ${url}`,
    )
  }

  const data = await res.json()

  if (!Array.isArray(data)) {
    throw new Error(`OpenF1 unexpected response shape at ${url}: expected array`)
  }

  return data as T[]
}

/**
 * Map an OpenF1 session_name to our canonical NormalizedSession type.
 * - "Race"             → "Race"
 * - "Sprint"           → "Sprint"
 * - "Qualifying" / "Sprint Qualifying" / "Sprint Shootout" → "Qualifying"
 * - anything else      → "Practice"
 */
function mapSessionType(
  sessionName: string,
): NormalizedSession['type'] {
  const name = sessionName.toLowerCase()
  if (name === 'race') return 'Race'
  if (name === 'sprint') return 'Sprint'
  if (name.includes('qualifying') || name.includes('shootout')) return 'Qualifying'
  return 'Practice'
}

/**
 * Derive a best-effort session status from available date fields.
 * OpenF1 does not provide an explicit status field in the sessions endpoint.
 */
function deriveSessionStatus(session: OpenF1Session): NormalizedSession['status'] {
  const now = Date.now()
  const start = session.date_start ? new Date(session.date_start).getTime() : null
  const end = session.date_end ? new Date(session.date_end).getTime() : null

  if (start !== null && now < start) return 'upcoming'
  if (end !== null && now > end) return 'finished'
  return 'active'
}

/**
 * Prefix a raw hex color string with '#'.
 * Guards against values that already have the prefix.
 */
function normalizeHexColor(raw: string | null | undefined): string {
  if (!raw) return '#FFFFFF'
  return raw.startsWith('#') ? raw : `#${raw}`
}

// ─────────────────────────────────────────────
// Provider implementation
// ─────────────────────────────────────────────

export class OpenF1Provider implements F1ProviderAdapter {
  async getMeetings(year: number): Promise<NormalizedMeeting[]> {
    const raw = await openF1Fetch<OpenF1Meeting>(`/meetings?year=${year}`)

    return raw.map((m) => ({
      meetingKey: m.meeting_key,
      name: m.meeting_name,
      circuitName: m.circuit_short_name,
      country: m.country_name,
      year: m.year,
    }))
  }

  async getSessions(year: number): Promise<NormalizedSession[]> {
    const raw = await openF1Fetch<OpenF1Session>(`/sessions?year=${year}`)

    return raw.map((s) => ({
      sessionKey: s.session_key,
      meetingKey: s.meeting_key,
      type: mapSessionType(s.session_name),
      scheduledStartUtc: new Date(s.date_start),
      status: deriveSessionStatus(s),
    }))
  }

  async getDriversForSession(sessionKey: number): Promise<NormalizedDriver[]> {
    const raw = await openF1Fetch<OpenF1Driver>(
      `/drivers?session_key=${sessionKey}`,
    )

    return raw.map((d) => ({
      driverNumber: d.driver_number,
      code: d.name_acronym,
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
      teamName: d.team_name ?? '',
      teamColor: normalizeHexColor(d.team_colour),
      photoUrl: d.headshot_url ?? null,
    }))
  }

  async getLiveClassification(
    sessionKey: number,
  ): Promise<NormalizedLiveClassification | null> {
    let raw: OpenF1Position[]

    try {
      raw = await openF1Fetch<OpenF1Position>(
        `/position?session_key=${sessionKey}`,
      )
    } catch {
      // No data available yet — not an error for live classification
      return null
    }

    if (raw.length === 0) return null

    // Reduce to the latest position entry per driver
    const latestByDriver = new Map<number, OpenF1Position>()
    for (const entry of raw) {
      const existing = latestByDriver.get(entry.driver_number)
      if (!existing || entry.date > existing.date) {
        latestByDriver.set(entry.driver_number, entry)
      }
    }

    // capturedAt = the most recent timestamp across all drivers
    const timestamps = Array.from(latestByDriver.values()).map((e) => e.date)
    const latestTimestamp = timestamps.sort().at(-1)!

    const positions = Array.from(latestByDriver.values())
      .map((e) => ({ driverNumber: e.driver_number, position: e.position }))
      .sort((a, b) => a.position - b.position)

    return {
      sessionKey,
      capturedAt: new Date(latestTimestamp),
      positions,
    }
  }

  async getFinalResults(sessionKey: number): Promise<NormalizedFinalResult[]> {
    // 1. Get the latest recorded position for each driver.
    const positionRaw = await openF1Fetch<OpenF1Position>(
      `/position?session_key=${sessionKey}`,
    )

    // 2. Reduce to latest entry per driver (highest date value).
    const latestByDriver = new Map<number, OpenF1Position>()
    for (const entry of positionRaw) {
      const existing = latestByDriver.get(entry.driver_number)
      if (!existing || entry.date > existing.date) {
        latestByDriver.set(entry.driver_number, entry)
      }
    }

    // 3. Detect retirements using stint data.
    //
    //    Stints represent completed units of work (compound + lap range) and
    //    are settled/finalized once a race is complete — more reliable than
    //    per-lap timing rows for historical races.
    //
    //    Logic: find each driver's last completed lap (max lap_end across all
    //    their stints). Drivers who completed < 90% of the race winner's laps
    //    are marked DNF. This catches mid-race retirements while keeping lapped
    //    cars (typically 1–2 laps down) as CLASSIFIED.
    const retiredDriverNumbers = new Set<number>()
    try {
      const stintRaw = await openF1Fetch<OpenF1Stint>(`/stints?session_key=${sessionKey}`)

      const lastLap = new Map<number, number>()
      for (const stint of stintRaw) {
        const cur = lastLap.get(stint.driver_number) ?? 0
        if (stint.lap_end > cur) lastLap.set(stint.driver_number, stint.lap_end)
      }

      if (lastLap.size > 0) {
        const maxLaps = Math.max(...Array.from(lastLap.values()))
        const threshold = maxLaps * 0.90

        for (const [driverNumber, laps] of Array.from(lastLap.entries())) {
          if (laps < threshold) retiredDriverNumbers.add(driverNumber)
        }

        // Drivers present in position data but with no stints = DNS (never started).
        // OpenF1 includes DNS drivers in /position at their grid slot.
        for (const driverNumber of Array.from(latestByDriver.keys())) {
          if (!lastLap.has(driverNumber)) {
            retiredDriverNumbers.add(driverNumber)
          }
        }
      }
    } catch (err) {
      console.error(`[openf1] Stint data unavailable for session ${sessionKey} — all drivers marked CLASSIFIED:`, err)
      // Re-ingest after data settles via POST /api/cron/ingest-results { raceId }
    }

    // 4. Compose final results
    const results: NormalizedFinalResult[] = Array.from(
      latestByDriver.values(),
    ).map((entry) => {
      const isRetired = retiredDriverNumbers.has(entry.driver_number)
      return {
        driverNumber: entry.driver_number,
        position: isRetired ? null : entry.position,
        status: isRetired ? 'DNF' : 'CLASSIFIED',
      } satisfies NormalizedFinalResult
    })

    // 5. Re-sequence classified positions to remove gaps left by DNF removals
    const classified = results
      .filter(r => r.status === 'CLASSIFIED')
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    classified.forEach((r, i) => { r.position = i + 1 })

    // Sort: classified by position ascending, then non-classified at end
    results.sort((a, b) => {
      if (a.position !== null && b.position !== null) return a.position - b.position
      if (a.position !== null) return -1
      if (b.position !== null) return 1
      return 0
    })

    return results
  }
}
