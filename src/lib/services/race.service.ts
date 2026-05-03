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
 * Return all drivers who participated (or are registered to participate) in a race.
 *
 * The entrant set is the UNION of:
 *   - RaceEntry rows (drivers registered for this race; populated by sync-entries
 *     and sync-schedule)
 *   - RaceResult driverIds (drivers who actually drove — covers in-session
 *     substitutes whose RaceEntry was never updated, e.g. a reserve called up
 *     after lock)
 *   - QualifyingResult driverIds (drivers who showed up for qualifying but were
 *     not in the registered entry list)
 *
 * Pre-race the union is just RaceEntry. Post-qualifying / post-race it grows
 * to include any substitute who appeared, so the results card and pick display
 * never render "???" for a real driver.
 */
export async function getRaceEntrants(
  raceId: string,
): Promise<DriverSummary[]> {
  const [entries, resultRows, qualifyingRows] = await Promise.all([
    db.raceEntry.findMany({ where: { raceId }, select: { driverId: true } }),
    db.raceResult.findMany({ where: { raceId }, select: { driverId: true } }),
    db.qualifyingResult.findMany({ where: { raceId }, select: { driverId: true } }),
  ])

  const driverIds = new Set<string>([
    ...entries.map((e) => e.driverId),
    ...resultRows.map((r) => r.driverId),
    ...qualifyingRows.map((q) => q.driverId),
  ])

  if (driverIds.size === 0) return []

  const drivers = await db.driver.findMany({
    where: { id: { in: Array.from(driverIds) } },
    include: { constructor: true },
    orderBy: { number: 'asc' },
  })

  const entrants = drivers.map((driver) => {
    const team = resolveTeam(driver.constructor.name)
    return {
      id: driver.id,
      code: driver.code,
      firstName: driver.firstName,
      lastName: driver.lastName,
      number: driver.number,
      photoUrl: DRIVER_PHOTOS[driver.number] ?? driver.photoUrl,
      seatKey: null,
      constructor: {
        id: driver.constructor.id,
        name: driver.constructor.name,
        shortName: driver.constructor.shortName,
        color: team?.color ?? driver.constructor.color,
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
