/**
 * Cron: ingest race + qualifying results from OpenF1 and compute scores.
 *
 * Pipeline per race (inside a per-race advisory lock):
 *   1. Ingest qualifying results if the race has a paired qualifying session
 *      and we don't have those results yet. Runs even when the race is
 *      still UPCOMING — the qualifying session finishes hours/days before
 *      lights-out and the result feeds the race detail page leaderboard.
 *   2. If the race is COMPLETED (or the caller forced/targeted it), fetch
 *      final race results → write RaceResult, then compute pick scores.
 *
 * Backfills up to 10 races per invocation.
 *
 * Protected by the CRON_SECRET environment variable.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { ingestResultsForRace, findRacesNeedingIngestion } from '@/lib/services/ingestion.service'
import { computeAndStoreScoresForRace } from '@/lib/services/scoring.service'
import {
  ingestQualifyingForRace,
  findRacesNeedingQualifyingIngestion,
} from '@/lib/services/qualifying.service'

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  return provided === secret
}

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    console.warn('[f10:cron:ingest] unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  let targetRaceIds: string[]
  let mode: 'force' | 'targeted' | 'auto' | 'fallback-latest' = 'auto'

  try {
    const body = await req.json()
    if (body?.force === true) {
      mode = 'force'
      const all = await db.race.findMany({
        where: { status: 'COMPLETED', openf1SessionKey: { not: null } },
        orderBy: { scheduledStartUtc: 'asc' },
        select: { id: true },
      })
      targetRaceIds = all.map((r) => r.id)
    } else if (typeof body?.raceId === 'string') {
      mode = 'targeted'
      targetRaceIds = [body.raceId]
    } else {
      const [needResults, needQuali] = await Promise.all([
        findRacesNeedingIngestion(),
        findRacesNeedingQualifyingIngestion(),
      ])
      targetRaceIds = Array.from(new Set([...needResults, ...needQuali]))
    }
  } catch {
    const [needResults, needQuali] = await Promise.all([
      findRacesNeedingIngestion(),
      findRacesNeedingQualifyingIngestion(),
    ])
    targetRaceIds = Array.from(new Set([...needResults, ...needQuali]))
  }

  if (targetRaceIds.length === 0) {
    const latest = await db.race.findFirst({
      where: { status: 'COMPLETED', openf1SessionKey: { not: null } },
      orderBy: { scheduledStartUtc: 'desc' },
      select: { id: true },
    })
    if (latest) {
      mode = 'fallback-latest'
      targetRaceIds = [latest.id]
    }
  }

  console.log(
    `[f10:cron:ingest] mode=${mode} targetCount=${targetRaceIds.length} ids=${JSON.stringify(targetRaceIds)}`,
  )

  if (targetRaceIds.length === 0) {
    console.log('[f10:cron:ingest] nothing to process')
    return NextResponse.json({ message: 'No races to process', processed: [] })
  }

  const results: Array<{
    raceId: string
    ingested: number
    scored: number
    qualified: number
    error?: string
  }> = []

  for (const raceId of targetRaceIds) {
    const raceStartedAt = Date.now()
    try {
      // Per-race advisory lock so two overlapping cron invocations (EventBridge
      // retry on timeout, manual force=true while a scheduled run is mid-flight)
      // can't interleave ingestion + scoring writes for the same race.
      const outcome = await db.$transaction(
        async (tx) => {
          const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
            SELECT pg_try_advisory_xact_lock(hashtext(${raceId})) AS locked
          `
          if (!lockRows[0]?.locked) {
            return { locked: false as const }
          }

          const race = await tx.race.findUnique({
            where: { id: raceId },
            select: {
              id: true,
              status: true,
              openf1SessionKey: true,
              openf1QualifyingSessionKey: true,
            },
          })
          if (!race) {
            return { locked: true as const, ingested: 0, scored: 0, qualified: 0 }
          }

          let qualified = 0
          let ingested = 0
          let scored = 0

          // Qualifying ingestion — runs whether the race is UPCOMING/LIVE/COMPLETED.
          // Provider returning 0 rows is treated as "session not finished yet"
          // and surfaces as qualified=0; not an error.
          if (race.openf1QualifyingSessionKey !== null) {
            try {
              qualified = await ingestQualifyingForRace(raceId, tx)
            } catch (e) {
              const m = e instanceof Error ? e.message : String(e)
              console.warn(
                `[f10:cron:ingest] quali soft-fail raceId=${raceId}: ${m}`,
              )
            }
          }

          // Race results + scoring when the race itself is over (COMPLETED, or
          // LIVE with start time well in the past), or when the caller
          // explicitly forced/targeted this race. ingestResultsForRace flips
          // status from LIVE → COMPLETED once results land in the DB.
          const allowRaceResults =
            race.openf1SessionKey !== null &&
            (race.status === 'COMPLETED' ||
              race.status === 'LIVE' ||
              mode === 'force' ||
              mode === 'targeted')

          if (allowRaceResults) {
            ingested = await ingestResultsForRace(raceId, tx)
            scored = await computeAndStoreScoresForRace(raceId, tx)
          }

          return { locked: true as const, ingested, scored, qualified }
        },
        { timeout: 120_000 },
      )

      if (!outcome.locked) {
        console.log(
          `[f10:cron:ingest] SKIP raceId=${raceId} — concurrent invocation holds lock (${Date.now() - raceStartedAt}ms)`,
        )
        results.push({
          raceId,
          ingested: 0,
          scored: 0,
          qualified: 0,
          error: 'locked-by-concurrent-invocation',
        })
        continue
      }

      results.push({
        raceId,
        ingested: outcome.ingested,
        scored: outcome.scored,
        qualified: outcome.qualified,
      })
      console.log(
        `[f10:cron:ingest] OK raceId=${raceId} ingested=${outcome.ingested} scored=${outcome.scored} qualified=${outcome.qualified} (${Date.now() - raceStartedAt}ms)`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ raceId, ingested: 0, scored: 0, qualified: 0, error: message })
      console.error(
        `[f10:cron:ingest] FAIL raceId=${raceId} (${Date.now() - raceStartedAt}ms): ${message}`,
      )
    }
  }

  console.log(
    `[f10:cron:ingest] done in ${Date.now() - startedAt}ms processed=${results.length} errors=${results.filter((r) => r.error).length}`,
  )

  return NextResponse.json({ processed: results })
}
