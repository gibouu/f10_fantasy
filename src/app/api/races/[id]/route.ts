import { NextResponse } from 'next/server'
import { getRaceById, getRaceEntrants } from '@/lib/services/race.service'
import { getQualifyingResults } from '@/lib/services/qualifying.service'
import { getDriverSeasonStats } from '@/lib/services/driver-season-stats'
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

  const [entrants, seasonStats, resultRows, qualifyingResults] =
    await Promise.all([
      getRaceEntrants(params.id),
      getDriverSeasonStats({
        seasonId: race.seasonId,
        raceType: race.type,
        before: race.scheduledStartUtc,
      }),
      race.status === 'COMPLETED'
        ? db.raceResult.findMany({
            where: { raceId: params.id },
            select: {
              driverId: true,
              position: true,
              status: true,
              fastestLap: true,
            },
            orderBy: { position: 'asc' },
          })
        : Promise.resolve([]),
      (async () => await getQualifyingResults(params.id))(),
    ])

  const enrichedEntrants = entrants.map((entrant) => {
    const stats = seasonStats.get(entrant.id)
    return {
      ...entrant,
      seasonAverageFinish: stats?.averageFinish ?? null,
      seasonDnfCount: stats?.dnfCount ?? null,
    }
  })

  const results = resultRows.map((result) => ({
    ...result,
    scoreGuide: getResultScoreGuide(result, race.type),
  }))

  return NextResponse.json({
    race: {
      ...race,
      scheduledStartUtc: race.scheduledStartUtc.toISOString(),
      lockCutoffUtc: race.lockCutoffUtc.toISOString(),
      qualifyingStartUtc: race.qualifyingStartUtc
        ? race.qualifyingStartUtc.toISOString()
        : null,
    },
    entrants: enrichedEntrants,
    results,
    qualifyingResults,
  })
}
