import { db } from '@/lib/db/client'
import type { RaceSummary } from '@/types/domain'

export type DriverSeasonStats = {
  averageFinish: number | null
  dnfCount: number
}

export async function getDriverSeasonStats({
  seasonId,
  raceType,
  before,
}: {
  seasonId: string
  raceType: RaceSummary['type']
  before: Date
}): Promise<Map<string, DriverSeasonStats>> {
  const race = {
    seasonId,
    type: raceType,
    status: 'COMPLETED' as const,
    scheduledStartUtc: { lt: before },
  }

  const [classified, nonClassified] = await Promise.all([
    db.raceResult.groupBy({
      by: ['driverId'],
      where: {
        race,
        status: 'CLASSIFIED',
        position: { not: null },
      },
      _avg: { position: true },
    }),
    db.raceResult.groupBy({
      by: ['driverId'],
      where: {
        race,
        status: { not: 'CLASSIFIED' },
      },
      _count: { _all: true },
    }),
  ])

  const stats = new Map<string, DriverSeasonStats>()

  for (const result of classified) {
    stats.set(result.driverId, {
      averageFinish: result._avg.position,
      dnfCount: 0,
    })
  }

  for (const result of nonClassified) {
    stats.set(result.driverId, {
      averageFinish: stats.get(result.driverId)?.averageFinish ?? null,
      dnfCount: result._count._all,
    })
  }

  return stats
}
