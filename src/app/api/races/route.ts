import { NextResponse } from 'next/server'
import { getActiveSeason, getRacesForSeason } from '@/lib/services/race.service'

export const dynamic = 'force-dynamic'

// No auth required — race schedule is public
export async function GET() {
  const season = await getActiveSeason()
  if (!season) {
    return NextResponse.json({ races: [], season: null })
  }

  const races = await getRacesForSeason(season.id)

  // Serialize dates for JSON
  const serialized = races.map((r) => ({
    ...r,
    scheduledStartUtc: r.scheduledStartUtc.toISOString(),
    lockCutoffUtc: r.lockCutoffUtc.toISOString(),
    qualifyingStartUtc: r.qualifyingStartUtc
      ? r.qualifyingStartUtc.toISOString()
      : null,
  }))

  return NextResponse.json({ races: serialized, season })
}
