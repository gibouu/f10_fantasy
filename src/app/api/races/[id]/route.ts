import { NextResponse } from 'next/server'
import { getRaceById, getRaceEntrants } from '@/lib/services/race.service'
import { db } from '@/lib/db/client'

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
      ? await db.raceResult.findMany({
          where: { raceId: params.id },
          select: {
            driverId: true,
            position: true,
            status: true,
            fastestLap: true,
          },
          orderBy: { position: 'asc' },
        })
      : []

  return NextResponse.json({
    race: {
      ...race,
      scheduledStartUtc: race.scheduledStartUtc.toISOString(),
      lockCutoffUtc: race.lockCutoffUtc.toISOString(),
    },
    entrants,
    results,
  })
}
