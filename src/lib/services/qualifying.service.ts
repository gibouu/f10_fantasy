/**
 * Qualifying result ingestion + read service.
 *
 * Stores results from the qualifying session that precedes each race
 * (main Qualifying for MAIN races, Sprint Shootout / Sprint Qualifying for
 * SPRINT races). Surfaced on the race detail page so users can use the grid
 * to inform their picks before the race itself.
 *
 * Idempotent — safe to call multiple times per race.
 */

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { createF1Provider } from '@/lib/f1/adapter'

type DbOrTx = Prisma.TransactionClient | typeof db

export type QualifyingResultRecord = {
  driverId: string
  position: number
}

/**
 * Read all qualifying results for a race, ordered by position.
 * Returns an empty array when no qualifying data has been ingested yet.
 */
export async function getQualifyingResults(
  raceId: string,
): Promise<QualifyingResultRecord[]> {
  const rows = await db.qualifyingResult.findMany({
    where: { raceId },
    select: { driverId: true, position: true },
    orderBy: { position: 'asc' },
  })
  return rows.map((r) => ({ driverId: r.driverId, position: r.position }))
}

/**
 * Ingest qualifying results from the F1 provider for a single race.
 *
 * The race must have `openf1QualifyingSessionKey` set (paired during
 * sync-schedule). Drivers without a `/position` row (no Q1 time, withdrew
 * before the session) are simply omitted — qualifying carries no DNF/DSQ
 * status in our model.
 *
 * @returns Number of rows upserted.
 * @throws  If the race is not found or has no qualifying session key.
 *          A provider returning zero rows is treated as a soft empty (no error)
 *          since a session may simply not be over yet.
 */
export async function ingestQualifyingForRace(
  raceId: string,
  client: DbOrTx = db,
): Promise<number> {
  const race = await client.race.findUnique({
    where: { id: raceId },
    select: {
      id: true,
      name: true,
      type: true,
      openf1QualifyingSessionKey: true,
    },
  })

  if (!race) throw new Error(`Race not found: ${raceId}`)
  if (!race.openf1QualifyingSessionKey) {
    throw new Error(
      `Race ${raceId} has no openf1QualifyingSessionKey — cannot ingest qualifying`,
    )
  }

  console.log(
    `[f10:quali] raceId=${raceId} (${race.name} ${race.type}) qualifyingKey=${race.openf1QualifyingSessionKey}`,
  )

  const provider = createF1Provider()
  const results = await provider.getFinalResults(race.openf1QualifyingSessionKey)

  console.log(
    `[f10:quali] OpenF1 returned ${results.length} rows for qualifying session ${race.openf1QualifyingSessionKey}`,
  )

  if (results.length === 0) {
    // Session may not be finished yet; let the next cron tick try again.
    return 0
  }

  const driverNumbers = results.map((r) => r.driverNumber)

  const dbDrivers = await client.$queryRaw<
    Array<{ id: string; openf1DriverNumber: number }>
  >`SELECT id, "openf1DriverNumber" FROM "Driver" WHERE "openf1DriverNumber" = ANY(${driverNumbers}::int[])`

  const driverMap = new Map(
    dbDrivers.map((d) => [d.openf1DriverNumber, d.id]),
  )

  const unmapped = results
    .filter((r) => !driverMap.has(r.driverNumber))
    .map((r) => r.driverNumber)
  if (unmapped.length > 0) {
    console.warn(
      `[f10:quali] raceId=${raceId} unmapped OpenF1 driver numbers: ${unmapped.join(',')}`,
    )
  }

  let written = 0
  for (const r of results) {
    const driverId = driverMap.get(r.driverNumber)
    if (!driverId) continue
    if (r.position === null) continue // qualifying has no DNF concept; skip unpositioned

    await client.qualifyingResult.upsert({
      where: { raceId_driverId: { raceId, driverId } },
      create: { raceId, driverId, position: r.position },
      update: { position: r.position },
    })
    written++
  }

  console.log(`[f10:quali] raceId=${raceId} written=${written}`)
  return written
}

/**
 * Find races that have a paired qualifying session key but no qualifying
 * results stored yet, scheduled within the last 14 days (forward window
 * included since qualifying happens before race start).
 */
export async function findRacesNeedingQualifyingIngestion(): Promise<string[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const races = await db.race.findMany({
    where: {
      openf1QualifyingSessionKey: { not: null },
      qualifyingResults: { none: {} },
      scheduledStartUtc: { gt: fourteenDaysAgo },
    },
    select: { id: true },
    orderBy: { scheduledStartUtc: 'asc' },
    take: 10,
  })
  return races.map((r) => r.id)
}
