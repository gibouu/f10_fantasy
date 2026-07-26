export function createRaceDetailGetHandler({
  getRaceById,
  getRaceEntrants,
  getDriverSeasonStats,
  findRaceResults,
  getQualifyingResults,
  getResultScoreGuide,
  publicRaceHeaders,
  raceDetailCacheControl,
  raceNotFoundCacheControl,
  serverTiming,
}) {
  return async function GET(_request, { params }) {
    const startedAt = Date.now()
    const raceStartedAt = Date.now()
    const race = await getRaceById(params.id)
    const raceDurationMs = Date.now() - raceStartedAt

    if (!race) {
      return Response.json(
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
    const relatedDurationMs = Date.now() - relatedStartedAt

    const serializeStartedAt = Date.now()
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
    const serializeDurationMs = Date.now() - serializeStartedAt

    return Response.json(
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
}
