import { getRaceById, getRaceEntrants } from '@/lib/services/race.service'
import { getQualifyingResults } from '@/lib/services/qualifying.service'
import { getDriverSeasonStats } from '@/lib/services/driver-season-stats'
import { db } from '@/lib/db/client'
import { getResultScoreGuide } from '@/lib/scoring/formula'
import { createRaceDetailGetHandler } from './get-handler'

const findRaceResults = (raceId: string) =>
  db.raceResult.findMany({
    where: { raceId },
    select: {
      driverId: true,
      position: true,
      status: true,
      fastestLap: true,
    },
    orderBy: { position: 'asc' },
  })

// No auth required — race details are public
export const GET = createRaceDetailGetHandler({
  getRaceById,
  getRaceEntrants,
  getDriverSeasonStats,
  findRaceResults,
  getQualifyingResults,
  getResultScoreGuide,
})
