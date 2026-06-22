function validateCronSecret(req, getCronSecret) {
  const secret = getCronSecret()
  if (!secret) return false
  const authHeader = req.headers.get("authorization")
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  return provided === secret
}

export async function handleDiagRaceGet(
  req,
  raceId,
  {
    db,
    getNow = () => new Date(),
    getCronSecret = () => process.env.CRON_SECRET,
  },
) {
  if (!validateCronSecret(req, getCronSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      id: true,
      seasonId: true,
      round: true,
      name: true,
      type: true,
      status: true,
      country: true,
      circuitName: true,
      scheduledStartUtc: true,
      lockCutoffUtc: true,
      openf1SessionKey: true,
      openf1MeetingKey: true,
      openf1QualifyingSessionKey: true,
    },
  })

  if (!race) {
    return Response.json({ error: "Race not found", raceId }, { status: 404 })
  }

  const [entryCount, resultRows, pickSetCount, scoreCount, latestScore, qualifyingCount] =
    await Promise.all([
      db.raceEntry.count({ where: { raceId } }),
      db.raceResult.findMany({
        where: { raceId },
        select: { status: true, position: true },
      }),
      db.pickSet.count({ where: { raceId } }),
      db.scoreBreakdown.count({
        where: { pickSet: { raceId } },
      }),
      db.scoreBreakdown.findFirst({
        where: { pickSet: { raceId } },
        orderBy: { computedAt: "desc" },
        select: { computedAt: true, totalScore: true },
      }),
      db.qualifyingResult.count({ where: { raceId } }),
    ])

  const resultStatusBreakdown = resultRows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const now = getNow()
  const lockCutoffPassed = race.lockCutoffUtc <= now
  const startedScheduled = race.scheduledStartUtc <= now
  const lockPicksOwnsRace = race.status === "UPCOMING" || race.status === "LIVE"

  const issues = []
  if (!race.openf1SessionKey) {
    issues.push(
      "race has no openf1SessionKey — sync-schedule needs to have linked it",
    )
  }
  if (entryCount === 0) {
    issues.push(
      "no RaceEntry rows — sync-schedule / sync-entries did not populate the grid",
    )
  }
  if (race.status === "COMPLETED" && resultRows.length === 0) {
    issues.push(
      "race status is COMPLETED but no RaceResult rows — ingest-results has not run successfully",
    )
  }
  if (
    race.status === "COMPLETED" &&
    resultRows.length > 0 &&
    pickSetCount > 0 &&
    scoreCount === 0
  ) {
    issues.push(
      "results stored but no ScoreBreakdown rows — compute-scores has not run successfully",
    )
  }
  if (resultRows.length > 0 && pickSetCount > 0 && scoreCount < pickSetCount) {
    issues.push(
      `score coverage is partial: ${scoreCount}/${pickSetCount} pick sets scored — recompute may be needed`,
    )
  }
  if (
    lockPicksOwnsRace &&
    startedScheduled &&
    race.status !== "LIVE"
  ) {
    issues.push(
      `scheduled start is in the past but status is ${race.status} — lock-picks should have flipped it to LIVE`,
    )
  }
  if (
    lockPicksOwnsRace &&
    lockCutoffPassed &&
    pickSetCount > 0
  ) {
    const unlocked = await db.pickSet.count({
      where: { raceId, lockedAt: null },
    })
    if (unlocked > 0) {
      issues.push(
        `lockCutoff passed but ${unlocked} pick set(s) still have lockedAt=null — lock-picks should have closed them`,
      )
    }
  }

  return Response.json({
    raceId,
    serverTime: now.toISOString(),
    race: {
      ...race,
      scheduledStartUtc: race.scheduledStartUtc.toISOString(),
      lockCutoffUtc: race.lockCutoffUtc.toISOString(),
    },
    timing: {
      lockCutoffPassed,
      startedScheduled,
      secondsUntilLock: Math.round(
        (race.lockCutoffUtc.getTime() - now.getTime()) / 1000,
      ),
      secondsSinceStart: Math.round(
        (now.getTime() - race.scheduledStartUtc.getTime()) / 1000,
      ),
    },
    entries: { total: entryCount },
    results: {
      total: resultRows.length,
      byStatus: resultStatusBreakdown,
    },
    qualifying: { total: qualifyingCount, sessionKey: race.openf1QualifyingSessionKey },
    picks: { total: pickSetCount, scored: scoreCount },
    latestScore: latestScore
      ? {
          totalScore: latestScore.totalScore,
          computedAt: latestScore.computedAt.toISOString(),
        }
      : null,
    issues,
    healthy: issues.length === 0,
  })
}
