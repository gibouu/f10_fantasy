export function createRaceDetailGetHandler({
  getRaceById,
  getRaceEntrants,
  getDriverSeasonStats,
  findRaceResults,
  getQualifyingResults,
  getResultScoreGuide,
}) {
  return async function GET(_request, { params }) {
    const race = await getRaceById(params.id)
    if (!race) {
      return Response.json({ error: 'Race not found' }, { status: 404 })
    }

    const [entrants, seasonForms, resultRows, qualifyingResults] =
      await Promise.all([
        getRaceEntrants(params.id),
        getDriverSeasonStats({
          seasonId: race.seasonId,
          raceType: race.type,
          before: race.scheduledStartUtc,
        }),
        race.status === 'COMPLETED'
          ? findRaceResults(params.id)
          : Promise.resolve([]),
        getQualifyingResults(params.id),
      ])

    const enrichedEntrants = entrants.map((entrant) => {
      const form = seasonForms.get(entrant.id)
      return {
        ...entrant,
        seasonAverageFinish: form?.averageFinish ?? null,
        seasonDnfCount: form?.nonClassifiedCount ?? null,
        seasonResults:
          form?.results.map(({ driverId: _driverId, scheduledStartUtc, ...result }) => ({
            ...result,
            scheduledStartUtc: scheduledStartUtc.toISOString(),
          })) ?? [],
      }
    })

    const results = resultRows.map((result) => ({
      ...result,
      scoreGuide: getResultScoreGuide(result, race.type),
    }))

    return Response.json({
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
}
