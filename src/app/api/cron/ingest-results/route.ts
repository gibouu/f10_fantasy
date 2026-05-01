/**
 * Cron: ingest race results from OpenF1 and compute scores.
 *
 * Pipeline per race:
 *   1. Fetch final results from OpenF1 → write to RaceResult
 *   2. Compute scores for all pick sets → write to ScoreBreakdown
 *
 * Runs after each race completes. Also backfills completed races that have
 * no stored results (up to 10 per invocation).
 *
 * Protected by the CRON_SECRET environment variable.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { ingestResultsForRace, findRacesNeedingIngestion } from '@/lib/services/ingestion.service'
import { computeAndStoreScoresForRace } from '@/lib/services/scoring.service'

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
      targetRaceIds = await findRacesNeedingIngestion()
    }
  } catch {
    targetRaceIds = await findRacesNeedingIngestion()
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
    error?: string
  }> = []

  for (const raceId of targetRaceIds) {
    const raceStartedAt = Date.now()
    try {
      const ingested = await ingestResultsForRace(raceId)
      const scored = await computeAndStoreScoresForRace(raceId)
      results.push({ raceId, ingested, scored })
      console.log(
        `[f10:cron:ingest] OK raceId=${raceId} ingested=${ingested} scored=${scored} (${Date.now() - raceStartedAt}ms)`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ raceId, ingested: 0, scored: 0, error: message })
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
