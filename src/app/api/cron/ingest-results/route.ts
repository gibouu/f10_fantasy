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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let targetRaceIds: string[]

  // Body may specify an explicit raceId for targeted re-ingestion
  try {
    const body = await req.json()
    if (typeof body?.raceId === 'string') {
      targetRaceIds = [body.raceId]
    } else {
      targetRaceIds = await findRacesNeedingIngestion()
    }
  } catch {
    targetRaceIds = await findRacesNeedingIngestion()
  }

  // If no backlog found, also check the most recently COMPLETED race
  // (it may already have results — ingestResultsForRace is idempotent)
  if (targetRaceIds.length === 0) {
    const latest = await db.race.findFirst({
      where: { status: 'COMPLETED', openf1SessionKey: { not: null } },
      orderBy: { scheduledStartUtc: 'desc' },
      select: { id: true },
    })
    if (latest) targetRaceIds = [latest.id]
  }

  if (targetRaceIds.length === 0) {
    return NextResponse.json({ message: 'No races to process', processed: [] })
  }

  const results: Array<{
    raceId: string
    ingested: number
    scored: number
    error?: string
  }> = []

  for (const raceId of targetRaceIds) {
    try {
      const ingested = await ingestResultsForRace(raceId)
      const scored = await computeAndStoreScoresForRace(raceId)
      results.push({ raceId, ingested, scored })
    } catch (err) {
      results.push({
        raceId,
        ingested: 0,
        scored: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ processed: results })
}
