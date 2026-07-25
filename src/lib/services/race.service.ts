/**
 * Race schedule and data service.
 *
 * Provides read access to race metadata, driver entries, and results.
 * All write operations (e.g. syncing from OpenF1) are handled by separate
 * admin/ingestion modules.
 */

import { db } from '@/lib/db/client'
import type { RaceSummary, DriverSummary } from '@/types/domain'
import { resolveTeam, DRIVER_PHOTOS } from '@/lib/f1/teams'
import { buildSeatLookup } from '@/lib/f1/seats'
import { mapRaceToSummary } from './race-summary.mapper'

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
 * Return all races for a season ordered chronologically (earliest first).
 *
 * Ordering by `scheduledStartUtc` (not `round`) so the list stays in real-world
 * order regardless of the rounds DB rows carry. Necessary because rows inserted
 * after the season started (see `scripts/reconcile-2026-calendar.ts`) land at
 * high temporary round numbers that don't match their chronological slot, and
 * because OpenF1 occasionally republishes meetings out of canonical order.
 */
export async function getRacesForSeason(
  seasonId: string,
): Promise<RaceSummary[]> {
  const races = await db.race.findMany({
    where: { seasonId, status: { not: 'CANCELLED' } },
    orderBy: { scheduledStartUtc: 'asc' },
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
      qualifyingStartUtc: true,
    },
  })

  return races.map(mapRaceToSummary)
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
      qualifyingStartUtc: true,
    },
  })

  return race ? mapRaceToSummary(race) : null
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
