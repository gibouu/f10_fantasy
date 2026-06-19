import test from "node:test"
import assert from "node:assert/strict"

import { fetchDriversForSessions } from "./driver-fetch.js"

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("fetchDriversForSessions caps concurrent driver requests", async () => {
  const sessions = Array.from({ length: 6 }, (_, index) => ({
    sessionKey: index + 1,
  }))
  const releases = sessions.map(() => deferred())
  let inFlight = 0
  let maxInFlight = 0
  let started = 0

  const resultPromise = fetchDriversForSessions(
    sessions,
    {
      getDriversForSession: async (sessionKey) => {
        started++
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await releases[sessionKey - 1].promise
        inFlight--
        return [{ driverNumber: sessionKey }]
      },
    },
    { concurrency: 2 },
  )

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(started, 2)

  releases[0].resolve()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(started, 3)

  for (const release of releases.slice(1)) {
    release.resolve()
  }

  const results = await resultPromise
  assert.equal(maxInFlight, 2)
  assert.deepEqual(
    results.map(({ drivers }) => drivers[0].driverNumber),
    [1, 2, 3, 4, 5, 6],
  )
})

test("fetchDriversForSessions logs failed and empty driver fetches", async () => {
  const warnings = []
  const sessions = [{ sessionKey: 11 }, { sessionKey: 12 }, { sessionKey: 13 }]

  const results = await fetchDriversForSessions(
    sessions,
    {
      getDriversForSession: async (sessionKey) => {
        if (sessionKey === 11) throw new Error("rate limited")
        if (sessionKey === 12) return []
        return [{ driverNumber: sessionKey }]
      },
    },
    {
      concurrency: 2,
      logger: { warn: (message) => warnings.push(message) },
    },
  )

  assert.deepEqual(
    results.map(({ drivers }) => drivers.length),
    [0, 0, 1],
  )
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /driver fetch FAIL session=11: rate limited/)
  assert.match(warnings[1], /no drivers for session=12/)
})
