/**
 * Race schedule and data service.
 *
 * Provides read access to race metadata, driver entries, and results.
 * All write operations (e.g. syncing from OpenF1) are handled by separate
 * admin/ingestion modules.
 */

import { db } from '@/lib/db/client'
import type { RaceSummary, DriverSummary, RaceResultRecord } from '@/types/domain'
import { RaceType, RaceStatus, ResultStatus } from '@/types/domain'
import { resolveTeam, DRIVER_PHOTOS } from '@/lib/f1/teams'
import { buildSeatLookup } from '@/lib/f1/seats'

// ─────────────────────────────────────────────
// Internal mappers
// ─────────────────────────────────────────────

function mapRace(race: {
  id: string
  seasonId: string
  round: number
  name: string
  circuitName: string
  country: string
  type: string
  scheduledStartUtc: Date
  lockCutoffUtc: Date
  status: string
}): RaceSummary {
  return {
    id: race.id,
    seasonId: race.seasonId,
    round: race.round,
    name: race.name,
    circuitName: race.circuitName,
    country: race.country,
    type: race.type as RaceType,
    scheduledStartUtc: race.scheduledStartUtc,
    lockCutoffUtc: race.lockCutoffUtc,
    status: race.status as RaceStatus,
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Return the currently active season, or null if none is marked active.
 */
export async function getActiveSeason(): Promise<{
  id: string
  year: number
} | null> {
  const season = await db.season.findFirst({
    where: { isActive: true },
    select: { id: true, year: true },
  })

  return season ?? null
}

/**
 * Return all races for a season ordered by round number ascending.
 */
export async function getRacesForSeason(
  seasonId: string,
): Promise<RaceSummary[]> {
  const races = await db.race.findMany({
    where: { seasonId },
    orderBy: { round: 'asc' },
    select: {
      id: true,
      seasonId: true,
      round: true,
      name: true,
      circuitName: true,
      country: true,
      type: true,
      scheduledStartUtc: true,
      lockCutoffUtc: true,
      status: true,
    },
  })

  return races.map(mapRace)
}

/**
 * Return the "current" race for a season using the following priority:
 *   1. LIVE race (if one exists)
 *   2. Next UPCOMING race (lowest round number)
 *   3. Most recently COMPLETED race (highest round number, as fallback when
 *      the season is over)
 *
 * Returns null if the season has no races at all.
 */
export async function getCurrentRace(
  seasonId: string,
): Promise<RaceSummary | null> {
  // Check for a live race first
  const live = await db.race.findFirst({
    where: { seasonId, status: 'LIVE' },
    orderBy: { round: 'asc' },
  })

  if (live) return mapRace(live)

  // Next upcoming race
  const upcoming = await db.race.findFirst({
    where: { seasonId, status: 'UPCOMING' },
    orderBy: { round: 'asc' },
  })

  if (upcoming) return mapRace(upcoming)

  // Fallback: most recently completed
  const completed = await db.race.findFirst({
    where: { seasonId, status: 'COMPLETED' },
    orderBy: { round: 'desc' },
  })

  return completed ? mapRace(completed) : null
}

/**
 * Return a single race by ID, or null if not found.
 */
export async function getRaceById(
  raceId: string,
): Promise<RaceSummary | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      id: true,
      seasonId: true,
      round: true,
      name: true,
      circuitName: true,
      country: true,
      type: true,
      scheduledStartUtc: true,
      lockCutoffUtc: true,
      status: true,
    },
  })

  return race ? mapRace(race) : null
}

/**
 * Return all drivers eligible for picking in a race.
 *
 * Pulls from RaceEntry (drivers registered for this specific race).
 * DNS entrants are included in the entry list but callers may wish to
 * filter them — the `isEligibleDnf` flag on RaceEntry can be used for
 * DNF-slot filtering in the UI.
 */
export async function getRaceEntrants(
  raceId: string,
): Promise<DriverSummary[]> {
  const entries = await db.raceEntry.findMany({
    where: { raceId },
    include: {
      driver: {
        include: {
          constructor: true,
        },
      },
    },
    orderBy: {
      driver: { number: 'asc' },
    },
  })

  const entrants = entries.map((entry) => {
    const team = resolveTeam(entry.driver.constructor.name)
    return {
      id: entry.driver.id,
      code: entry.driver.code,
      firstName: entry.driver.firstName,
      lastName: entry.driver.lastName,
      number: entry.driver.number,
      photoUrl: DRIVER_PHOTOS[entry.driver.number] ?? entry.driver.photoUrl,
      seatKey: null,
      constructor: {
        id: entry.driver.constructor.id,
        name: entry.driver.constructor.name,
        shortName: entry.driver.constructor.shortName,
        color: team?.color ?? entry.driver.constructor.color,
        slug: team?.slug ?? null,
        logoUrl: team?.logoUrl ?? null,
      },
    }
  })

  const seatLookup = buildSeatLookup(
    entrants.map((entrant) => ({
      id: entrant.id,
      code: entrant.code,
      number: entrant.number,
      teamId: entrant.constructor.id,
      teamSlug: entrant.constructor.slug,
    })),
  )

  return entrants.map((entrant) => ({
    ...entrant,
    seatKey: seatLookup.driverIdToSeatKey.get(entrant.id) ?? null,
  }))
}

/**
 * Return the final results for a race, annotated with the race summary.
 *
 * Returns an array (normally a single element) because the type signature
 * allows for future multi-session expansion. Each element bundles the
 * RaceSummary with its associated result records.
 */
export async function getRaceResults(
  raceId: string,
): Promise<Array<RaceSummary & { results: RaceResultRecord[] }>> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    include: {
      results: {
        orderBy: [
          // Classified finishers first by position, then non-classified
          { position: 'asc' },
        ],
        select: {
          driverId: true,
          position: true,
          status: true,
          fastestLap: true,
        },
      },
    },
  })

  if (!race) return []

  const raceSummary = mapRace(race)

  const results: RaceResultRecord[] = race.results.map((r) => ({
    driverId: r.driverId,
    position: r.position,
    status: r.status as ResultStatus,
    fastestLap: r.fastestLap,
  }))

  return [{ ...raceSummary, results }]
}
