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
    select: { id: true, openf1SessionKey: true, status: true, name: true, type: true },
  })

  if (!race) throw new Error(`Race not found: ${raceId}`)
  if (!race.openf1SessionKey) {
    throw new Error(`Race ${raceId} has no OpenF1 session key — cannot fetch results`)
  }

  console.log(
    `[f10:ingest] raceId=${raceId} (${race.name} ${race.type}) sessionKey=${race.openf1SessionKey} status=${race.status}`,
  )

  const provider = createF1Provider()
  const finalResults = await provider.getFinalResults(race.openf1SessionKey)

  console.log(
    `[f10:ingest] OpenF1 returned ${finalResults.length} rows for session ${race.openf1SessionKey}`,
  )

  if (finalResults.length === 0) {
    throw new Error(
      `OpenF1 returned no results for session ${race.openf1SessionKey} (race ${raceId}) — race may not be finished yet`,
    )
  }

  // Build openf1DriverNumber → DB driver id map
  const driverNumbers = finalResults.map((r) => r.driverNumber)

  const dbDrivers = await db.$queryRaw<
    Array<{ id: string; openf1DriverNumber: number }>
  >`SELECT id, "openf1DriverNumber" FROM "Driver" WHERE "openf1DriverNumber" = ANY(${driverNumbers}::int[])`

  const driverMap = new Map(
    dbDrivers.map((d) => [d.openf1DriverNumber, d.id]),
  )

  const unmapped = finalResults
    .filter((r) => !driverMap.has(r.driverNumber))
    .map((r) => r.driverNumber)
  if (unmapped.length > 0) {
    console.warn(
      `[f10:ingest] raceId=${raceId} unmapped OpenF1 driver numbers (no DB row, e.g. substitute): ${unmapped.join(',')}`,
    )
  }

  let ingested = 0
  const statusCounts: Record<string, number> = {}

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

    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1
    ingested++
  }

  // Ensure race status reflects completion
  if (race.status !== 'COMPLETED') {
    await db.race.update({
      where: { id: raceId },
      data: { status: 'COMPLETED' },
    })
    console.log(`[f10:ingest] raceId=${raceId} flipped status ${race.status} → COMPLETED`)
  }

  console.log(
    `[f10:ingest] raceId=${raceId} ingested=${ingested} statusBreakdown=${JSON.stringify(statusCounts)}`,
  )

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
