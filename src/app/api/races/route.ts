import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getActiveSeason, getRacesForSeason } from '@/lib/services/race.service'
import {
  publicRaceHeaders,
  raceListCacheControl,
  serverTiming,
} from '@/lib/api/public-race-cache'

// No auth required — race schedule is public
export async function GET() {
  // DB-backed route: evaluate at request time, then let CDN cache via headers.
  headers()

  const startedAt = Date.now()
  const dbStartedAt = Date.now()
  const season = await getActiveSeason()
  let dbDurationMs = Date.now() - dbStartedAt

  if (!season) {
    return NextResponse.json(
      { races: [], season: null },
      {
        headers: publicRaceHeaders({
          cacheControl: raceListCacheControl(),
          serverTiming: serverTiming([
            { name: 'auth', durationMs: 0, description: 'public-bypass' },
            { name: 'cache', durationMs: 0, description: 'shared' },
            { name: 'db', durationMs: dbDurationMs },
            { name: 'serialize', durationMs: 0 },
            { name: 'total', durationMs: Date.now() - startedAt },
          ]),
        }),
      },
    )
  }

  const racesStartedAt = Date.now()
  const races = await getRacesForSeason(season.id)
  dbDurationMs += Date.now() - racesStartedAt

  // Serialize dates for JSON
  const serializeStartedAt = Date.now()
  const serialized = races.map((r) => ({
    ...r,
    scheduledStartUtc: r.scheduledStartUtc.toISOString(),
    lockCutoffUtc: r.lockCutoffUtc.toISOString(),
    qualifyingStartUtc: r.qualifyingStartUtc
      ? r.qualifyingStartUtc.toISOString()
      : null,
  }))
  const serializeDurationMs = Date.now() - serializeStartedAt

  return NextResponse.json(
    { races: serialized, season },
    {
      headers: publicRaceHeaders({
        cacheControl: raceListCacheControl(),
        serverTiming: serverTiming([
          { name: 'auth', durationMs: 0, description: 'public-bypass' },
          { name: 'cache', durationMs: 0, description: 'shared' },
          { name: 'db', durationMs: dbDurationMs },
          { name: 'serialize', durationMs: serializeDurationMs },
          { name: 'total', durationMs: Date.now() - startedAt },
        ]),
      }),
    },
  )
}
