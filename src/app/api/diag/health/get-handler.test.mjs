import test from "node:test"
import assert from "node:assert/strict"

import { handleDiagHealthGet } from "./get-handler.js"

const NOW = new Date("2026-06-22T10:00:00.000Z")

function request(token) {
  return new Request("http://localhost/api/diag/health", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

function dependencies(overrides = {}) {
  return {
    getCronSecret: () => "secret",
    getNow: () => NOW,
    db: {
      race: {
        findMany: async () => [],
        findUnique: async () => null,
      },
      raceEntry: { count: async () => 0 },
      raceResult: { count: async () => 0 },
      pickSet: { count: async () => 0 },
      scoreBreakdown: { count: async () => 0 },
    },
    ...overrides,
  }
}

test("diagnostic health GET rejects missing cron authorization without querying races", async () => {
  const calls = []
  const response = await handleDiagHealthGet(
    request(),
    dependencies({
      db: {
        race: {
          findMany: async () => {
            calls.push("findMany")
            return []
          },
        },
      },
    }),
  )

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: "Unauthorized" })
  assert.deepEqual(calls, [])
})

test("diagnostic health GET serializes snapshots and aggregates issue flags", async () => {
  const races = new Map([
    [
      "race-upcoming",
      {
        id: "race-upcoming",
        name: "Canadian Grand Prix",
        type: "RACE",
        status: "UPCOMING",
        scheduledStartUtc: new Date("2026-06-22T10:05:00.000Z"),
        lockCutoffUtc: new Date("2026-06-22T09:50:00.000Z"),
        openf1SessionKey: null,
      },
    ],
    [
      "race-completed",
      {
        id: "race-completed",
        name: "Monaco Grand Prix",
        type: "RACE",
        status: "COMPLETED",
        scheduledStartUtc: new Date("2026-06-21T13:00:00.000Z"),
        lockCutoffUtc: new Date("2026-06-21T12:45:00.000Z"),
        openf1SessionKey: "session-1",
      },
    ],
  ])
  const counts = {
    "race-upcoming": { entries: 0, results: 0, picks: 0, scored: 0 },
    "race-completed": { entries: 20, results: 0, picks: 2, scored: 0 },
  }
  const db = {
    race: {
      findMany: async ({ where }) =>
        where.status === "COMPLETED"
          ? [{ id: "race-completed" }]
          : [{ id: "race-upcoming" }],
      findUnique: async ({ where }) => races.get(where.id) ?? null,
    },
    raceEntry: { count: async ({ where }) => counts[where.raceId].entries },
    raceResult: { count: async ({ where }) => counts[where.raceId].results },
    pickSet: { count: async ({ where }) => counts[where.raceId].picks },
    scoreBreakdown: {
      count: async ({ where }) => counts[where.pickSet.raceId].scored,
    },
  }

  const response = await handleDiagHealthGet(request("secret"), dependencies({ db }))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.serverTime, NOW.toISOString())
  assert.equal(body.healthy, false)
  assert.equal(body.upcoming[0].scheduledStartUtc, "2026-06-22T10:05:00.000Z")
  assert.equal(body.upcoming[0].lockCutoffUtc, "2026-06-22T09:50:00.000Z")
  assert.equal(body.upcoming[0].secondsUntilStart, 300)
  assert.deepEqual(body.upcoming[0].issues, [
    "no openf1SessionKey",
    "no RaceEntry rows",
  ])
  assert.deepEqual(body.issues, [
    {
      raceId: "race-upcoming",
      name: "Canadian Grand Prix",
      issues: ["no openf1SessionKey", "no RaceEntry rows"],
    },
    {
      raceId: "race-completed",
      name: "Monaco Grand Prix",
      issues: ["COMPLETED but no results"],
    },
  ])
})
