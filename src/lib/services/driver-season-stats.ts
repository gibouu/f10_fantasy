import { db } from '@/lib/db/client'
import type {
  DriverSeasonForm,
  RaceSummary,
  ResultStatus,
} from '@/types/domain'

export async function getDriverSeasonStats({
  seasonId,
  raceType,
  before,
}: {
  seasonId: string
  raceType: RaceSummary['type']
  before: Date
}): Promise<Map<string, DriverSeasonForm>> {
  const rows = await db.raceResult.findMany({
    where: {
      race: {
        seasonId,
        type: raceType,
        status: 'COMPLETED',
        scheduledStartUtc: { lt: before },
      },
    },
    select: {
      driverId: true,
      raceId: true,
      position: true,
      status: true,
      race: { select: { name: true, scheduledStartUtc: true } },
    },
    orderBy: [
      { race: { scheduledStartUtc: 'desc' } },
      { raceId: 'desc' },
      { driverId: 'asc' },
    ],
  })

  const forms = new Map<
    string,
    DriverSeasonForm & { classifiedFinishTotal: number; classifiedFinishCount: number }
  >()

  for (const row of rows) {
    const form = forms.get(row.driverId) ?? {
      averageFinish: null,
      nonClassifiedCount: 0,
      results: [],
      classifiedFinishTotal: 0,
      classifiedFinishCount: 0,
    }

    form.results.push({
      driverId: row.driverId,
      raceId: row.raceId,
      raceName: row.race.name,
      scheduledStartUtc: row.race.scheduledStartUtc,
      position: row.position,
      status: row.status as ResultStatus,
    })

    if (row.status === 'CLASSIFIED' && row.position !== null) {
      form.classifiedFinishTotal += row.position
      form.classifiedFinishCount += 1
    } else if (row.status !== 'CLASSIFIED') {
      form.nonClassifiedCount += 1
    }

    forms.set(row.driverId, form)
  }

  return new Map(
    Array.from(forms, ([driverId, form]) => [
      driverId,
      {
        averageFinish:
          form.classifiedFinishCount === 0
            ? null
            : form.classifiedFinishTotal / form.classifiedFinishCount,
        nonClassifiedCount: form.nonClassifiedCount,
        results: form.results,
      },
    ]),
  )
}
