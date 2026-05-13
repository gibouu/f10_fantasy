import { NextResponse } from 'next/server'
import { getRaceById, getRaceEntrants } from '@/lib/services/race.service'
import { getQualifyingResults } from '@/lib/services/qualifying.service'
import { db } from '@/lib/db/client'
import { getResultScoreGuide } from '@/lib/scoring/formula'

// No auth required — race details are public
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const race = await getRaceById(params.id)
  if (!race) {
    return NextResponse.json({ error: 'Race not found' }, { status: 404 })
  }

  const entrants = await getRaceEntrants(params.id)

  // Include results if race is completed
  const results =
    race.status === 'COMPLETED'
      ? (
          await db.raceResult.findMany({
            where: { raceId: params.id },
            select: {
              driverId: true,
              position: true,
              status: true,
              fastestLap: true,
            },
            orderBy: { position: 'asc' },
          })
        ).map((result) => ({
          ...result,
          scoreGuide: getResultScoreGuide(result, race.type),
        }))
      : []

  // Defensive: qualifying ingestion may not have run, or the table may be
  // missing in older deploys. Empty array → iOS hides the section.
  const qualifyingResults = await getQualifyingResults(params.id).catch(() => [])

  return NextResponse.json({
    race: {
      ...race,
      scheduledStartUtc: race.scheduledStartUtc.toISOString(),
      lockCutoffUtc: race.lockCutoffUtc.toISOString(),
      qualifyingStartUtc: race.qualifyingStartUtc
        ? race.qualifyingStartUtc.toISOString()
        : null,
    },
    entrants,
    results,
    qualifyingResults,
  })
}
