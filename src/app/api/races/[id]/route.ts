import { NextResponse } from 'next/server'
import { getRaceById, getRaceEntrants } from '@/lib/services/race.service'
import { getQualifyingResults } from '@/lib/services/qualifying.service'
import { getDriverSeasonStats } from '@/lib/services/driver-season-stats'
import { db } from '@/lib/db/client'
import { getResultScoreGuide } from '@/lib/scoring/formula'
import {
  publicRaceHeaders,
  raceDetailCacheControl,
  raceNotFoundCacheControl,
  serverTiming,
} from '@/lib/api/public-race-cache'

// No auth required — race details are public
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const startedAt = Date.now()
  const raceStartedAt = Date.now()
  const race = await getRaceById(params.id)
  const raceDurationMs = Date.now() - raceStartedAt

  if (!race) {
    return NextResponse.json(
      { error: 'Race not found' },
      {
        status: 404,
        headers: publicRaceHeaders({
          cacheControl: raceNotFoundCacheControl(),
          raceId: params.id,
          serverTiming: serverTiming([
            { name: 'auth', durationMs: 0, description: 'public-bypass' },
            { name: 'cache', durationMs: 0, description: 'shared' },
            { name: 'db', durationMs: raceDurationMs },
            { name: 'serialize', durationMs: 0 },
            { name: 'total', durationMs: Date.now() - startedAt },
          ]),
        }),
      },
    )
  }

  const relatedStartedAt = Date.now()
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
  const relatedDurationMs = Date.now() - relatedStartedAt

  const serializeStartedAt = Date.now()
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
  const serializeDurationMs = Date.now() - serializeStartedAt

  return NextResponse.json(
    {
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
    },
    {
      headers: publicRaceHeaders({
        cacheControl: raceDetailCacheControl(race.status),
        raceId: params.id,
        serverTiming: serverTiming([
          { name: 'auth', durationMs: 0, description: 'public-bypass' },
          { name: 'cache', durationMs: 0, description: 'shared' },
          { name: 'db.race', durationMs: raceDurationMs },
          { name: 'db.related', durationMs: relatedDurationMs },
          { name: 'serialize', durationMs: serializeDurationMs },
          { name: 'total', durationMs: Date.now() - startedAt },
        ]),
      }),
    },
  )
}
