/**
 * Race result ingestion service.
 *
 * Fetches final results from the F1 provider and persists them to the
 * RaceResult table. Idempotent — safe to call multiple times per race.
 *
 * Call this BEFORE computeAndStoreScoresForRace, which requires results
 * to already exist in the DB.
 */

import { db } from '@/lib/db/client'
import { createF1Provider } from '@/lib/f1/adapter'

/**
 * Ingest final race results from the F1 provider and store in RaceResult.
 *
 * @returns Number of driver results written (upserted).
 * @throws  If the race is not found, has no session key, or the provider
 *          returns no results.
 */
export async function ingestResultsForRace(raceId: string): Promise<number> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { id: true, openf1SessionKey: true, status: true },
  })

  if (!race) throw new Error(`Race not found: ${raceId}`)
  if (!race.openf1SessionKey) {
    throw new Error(`Race ${raceId} has no OpenF1 session key — cannot fetch results`)
  }

  const provider = createF1Provider()
  const finalResults = await provider.getFinalResults(race.openf1SessionKey)

  if (finalResults.length === 0) {
    throw new Error(
      `OpenF1 returned no results for session ${race.openf1SessionKey} (race ${raceId}) — race may not be finished yet`,
    )
  }

  // Build openf1DriverNumber → DB driver id map
  const driverNumbers = finalResults.map((r) => r.driverNumber)

  const dbDrivers = await db.$queryRaw<
    Array<{ id: string; openf1_driver_number: number }>
  >`SELECT id, openf1_driver_number FROM "Driver" WHERE openf1_driver_number = ANY(${driverNumbers}::int[])`

  const driverMap = new Map(
    dbDrivers.map((d) => [d.openf1_driver_number, d.id]),
  )

  let ingested = 0

  for (const result of finalResults) {
    const driverId = driverMap.get(result.driverNumber)
    if (!driverId) continue // driver not in DB (substitute, etc.)

    await db.raceResult.upsert({
      where: { raceId_driverId: { raceId, driverId } },
      create: {
        raceId,
        driverId,
        position: result.position,
        status: result.status,
      },
      update: {
        position: result.position,
        status: result.status,
      },
    })

    ingested++
  }

  // Ensure race status reflects completion
  if (race.status !== 'COMPLETED') {
    await db.race.update({
      where: { id: raceId },
      data: { status: 'COMPLETED' },
    })
  }

  return ingested
}

/**
 * Find all races that are marked COMPLETED but have no stored results,
 * or races where re-ingestion is explicitly requested.
 *
 * @returns Array of race IDs needing ingestion.
 */
export async function findRacesNeedingIngestion(): Promise<string[]> {
  // Completed races with no RaceResult rows
  const races = await db.race.findMany({
    where: {
      status: 'COMPLETED',
      results: { none: {} },
      openf1SessionKey: { not: null },
    },
    select: { id: true },
    orderBy: { scheduledStartUtc: 'desc' },
    take: 10, // process up to 10 backfill races per cron run
  })

  return races.map((r) => r.id)
}
