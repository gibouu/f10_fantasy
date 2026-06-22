import test from "node:test"
import assert from "node:assert/strict"

import { handleDiagRaceGet } from "./[id]/get-handler.js"

const NOW = new Date("2026-06-22T10:00:00.000Z")

function request(token) {
  return new Request("http://localhost/api/diag/race/race-1", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

function dependencies(overrides = {}) {
  return {
    getCronSecret: () => "secret",
    getNow: () => NOW,
    db: {
      race: { findUnique: async () => null },
      raceEntry: { count: async () => 0 },
      raceResult: { findMany: async () => [] },
      pickSet: { count: async () => 0 },
      scoreBreakdown: {
        count: async () => 0,
        findFirst: async () => null,
      },
      qualifyingResult: { count: async () => 0 },
    },
    ...overrides,
  }
}

function race(overrides = {}) {
  return {
    id: "race-1",
    seasonId: "season-1",
    round: 1,
    name: "Canadian Grand Prix",
    type: "RACE",
    status: "COMPLETED",
    country: "Canada",
    circuitName: "Circuit Gilles Villeneuve",
    scheduledStartUtc: new Date("2026-06-21T18:00:00.000Z"),
    lockCutoffUtc: new Date("2026-06-21T17:45:00.000Z"),
    openf1SessionKey: "session-1",
    openf1MeetingKey: "meeting-1",
    openf1QualifyingSessionKey: "qualifying-1",
    ...overrides,
  }
}

test("race diagnostic GET rejects bad cron authorization without querying races", async () => {
  const calls = []
  const response = await handleDiagRaceGet(
    request("wrong"),
    "race-1",
    dependencies({
      db: {
        race: {
          findUnique: async () => {
            calls.push("findUnique")
            return null
          },
        },
      },
    }),
  )

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: "Unauthorized" })
  assert.deepEqual(calls, [])
})

test("race diagnostic GET returns 404 for unknown races", async () => {
  const response = await handleDiagRaceGet(request("secret"), "missing-race", dependencies())

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), {
    error: "Race not found",
    raceId: "missing-race",
  })
})

test("race diagnostic GET serializes healthy race details", async () => {
  const response = await handleDiagRaceGet(
    request("secret"),
    "race-1",
    dependencies({
      db: {
        race: { findUnique: async () => race() },
        raceEntry: { count: async () => 20 },
        raceResult: {
          findMany: async () => [
            { status: "CLASSIFIED", position: 1 },
            { status: "CLASSIFIED", position: 2 },
            { status: "DNF", position: null },
          ],
        },
        pickSet: { count: async () => 2 },
        scoreBreakdown: {
          count: async () => 2,
          findFirst: async () => ({
            totalScore: 57,
            computedAt: new Date("2026-06-21T20:00:00.000Z"),
          }),
        },
        qualifyingResult: { count: async () => 20 },
      },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.serverTime, NOW.toISOString())
  assert.equal(body.healthy, true)
  assert.deepEqual(body.issues, [])
  assert.equal(body.race.scheduledStartUtc, "2026-06-21T18:00:00.000Z")
  assert.equal(body.race.lockCutoffUtc, "2026-06-21T17:45:00.000Z")
  assert.equal(body.timing.lockCutoffPassed, true)
  assert.equal(body.timing.startedScheduled, true)
  assert.deepEqual(body.results.byStatus, { CLASSIFIED: 2, DNF: 1 })
  assert.equal(body.latestScore.computedAt, "2026-06-21T20:00:00.000Z")
})

test("race diagnostics skip lock-picks heuristics for cancelled races", async () => {
  let unlockedPickCountQueried = false
  const response = await handleDiagRaceGet(
    request("secret"),
    "race-1",
    dependencies({
      db: {
        race: {
          findUnique: async () =>
            race({
              status: "CANCELLED",
              scheduledStartUtc: new Date("2026-06-21T18:00:00.000Z"),
              lockCutoffUtc: new Date("2026-06-21T17:45:00.000Z"),
            }),
        },
        raceEntry: { count: async () => 20 },
        raceResult: { findMany: async () => [] },
        pickSet: {
          count: async ({ where }) => {
            if ("lockedAt" in where) {
              unlockedPickCountQueried = true
            }
            return 2
          },
        },
        scoreBreakdown: {
          count: async () => 0,
          findFirst: async () => null,
        },
        qualifyingResult: { count: async () => 0 },
      },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(unlockedPickCountQueried, false)
  assert.deepEqual(body.issues, [])
  assert.equal(body.healthy, true)
})
