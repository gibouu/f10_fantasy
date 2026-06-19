export async function fetchDriversForSessions(
  sessions,
  { getDriversForSession },
  { concurrency = 4, logger = console } = {},
) {
  const limit = Math.max(1, Math.floor(concurrency))
  const results = new Array(sessions.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < sessions.length) {
      const index = nextIndex
      nextIndex++
      const session = sessions[index]

      try {
        const drivers = await getDriversForSession(session.sessionKey)
        if (drivers.length === 0) {
          logger.warn(
            `[f10:cron:sync-schedule] no drivers for session=${session.sessionKey}`,
          )
        }
        results[index] = { session, drivers }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(
          `[f10:cron:sync-schedule] driver fetch FAIL session=${session.sessionKey}: ${message}`,
        )
        results[index] = { session, drivers: [] }
      }
    }
  }

  const workerCount = Math.min(limit, sessions.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
