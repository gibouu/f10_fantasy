import assert from "node:assert/strict"
import test from "node:test"

import { createRaceDetailGetHandler } from "./get-handler.js"

const race = {
  id: "belgium",
  seasonId: "season-2026",
  round: 13,
  name: "Belgian Grand Prix",
  circuitName: "Spa-Francorchamps",
  country: "Belgium",
  type: "MAIN",
  scheduledStartUtc: new Date("2026-07-19T13:00:00.000Z"),
  lockCutoffUtc: new Date("2026-07-19T12:58:00.000Z"),
  status: "COMPLETED",
  qualifyingStartUtc: new Date("2026-07-18T14:00:00.000Z"),
}

const entrant = {
  id: "norris",
  code: "NOR",
  firstName: "Lando",
  lastName: "Norris",
  number: 4,
  photoUrl: "/drivers/norris.png",
  seatKey: "mclaren:1",
  constructor: {
    id: "mclaren",
    name: "McLaren",
    shortName: "MCL",
    color: "#FF8000",
    slug: "mclaren",
    logoUrl: "/teamlogos/mclaren.webp",
  },
}

test("GET returns the race, entrant form history, scored results, and qualifying", async () => {
  const calls = {
    race: [],
    entrants: [],
    season: [],
    results: [],
    qualifying: [],
    scoreGuide: [],
  }
  const getHandler = createRaceDetailGetHandler({
    getRaceById: async (raceId) => {
      calls.race.push(raceId)
      return race
    },
    getRaceEntrants: async (raceId) => {
      calls.entrants.push(raceId)
      return [entrant]
    },
    getDriverSeasonStats: async (params) => {
      calls.season.push(params)
      return new Map([
        [
          "norris",
          {
            averageFinish: 3.5,
            nonClassifiedCount: 2,
            results: [
              {
                driverId: "norris",
                raceId: "britain",
                raceName: "British Grand Prix",
                scheduledStartUtc: new Date("2026-07-05T14:00:00.000Z"),
                position: 5,
                status: "CLASSIFIED",
              },
              {
                driverId: "norris",
                raceId: "austria",
                raceName: "Austrian Grand Prix",
                scheduledStartUtc: new Date("2026-06-28T13:00:00.000Z"),
                position: null,
                status: "DNF",
              },
            ],
          },
        ],
      ])
    },
    findRaceResults: async (raceId) => {
      calls.results.push(raceId)
      return [
        {
          driverId: "norris",
          position: 5,
          status: "CLASSIFIED",
          fastestLap: true,
        },
      ]
    },
    getQualifyingResults: async (raceId) => {
      calls.qualifying.push(raceId)
      return [{ driverId: "norris", position: 1, status: "CLASSIFIED" }]
    },
    getResultScoreGuide: (result, raceType) => {
      calls.scoreGuide.push({ result, raceType })
      return { p10: 8, winner: 0, dnf: 0 }
    },
  })

  const response = await getHandler(new Request("http://localhost/api/races/belgium"), {
    params: { id: "belgium" },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(calls.race, ["belgium"])
  assert.deepEqual(calls.entrants, ["belgium"])
  assert.deepEqual(calls.season, [
    {
      seasonId: "season-2026",
      raceType: "MAIN",
      before: race.scheduledStartUtc,
    },
  ])
  assert.deepEqual(calls.results, ["belgium"])
  assert.deepEqual(calls.qualifying, ["belgium"])
  assert.deepEqual(calls.scoreGuide, [
    {
      result: {
        driverId: "norris",
        position: 5,
        status: "CLASSIFIED",
        fastestLap: true,
      },
      raceType: "MAIN",
    },
  ])
  assert.equal(body.race.scheduledStartUtc, "2026-07-19T13:00:00.000Z")
  assert.equal(body.race.lockCutoffUtc, "2026-07-19T12:58:00.000Z")
  assert.equal(body.race.qualifyingStartUtc, "2026-07-18T14:00:00.000Z")
  assert.equal(body.entrants[0].seasonAverageFinish, 3.5)
  assert.equal(body.entrants[0].seasonDnfCount, 2)
  assert.equal(
    body.entrants[0].seasonResults[0].scheduledStartUtc,
    "2026-07-05T14:00:00.000Z",
  )
  assert.equal("driverId" in body.entrants[0].seasonResults[0], false)
  assert.deepEqual(body.results, [
    {
      driverId: "norris",
      position: 5,
      status: "CLASSIFIED",
      fastestLap: true,
      scoreGuide: { p10: 8, winner: 0, dnf: 0 },
    },
  ])
  assert.deepEqual(body.qualifyingResults, [
    { driverId: "norris", position: 1, status: "CLASSIFIED" },
  ])
})

test("GET returns 404 before loading dependent race detail data", async () => {
  const called = []
  const getHandler = createRaceDetailGetHandler({
    getRaceById: async () => null,
    getRaceEntrants: async () => called.push("entrants"),
    getDriverSeasonStats: async () => called.push("season"),
    findRaceResults: async () => called.push("results"),
    getQualifyingResults: async () => called.push("qualifying"),
    getResultScoreGuide: () => called.push("scoreGuide"),
  })

  const response = await getHandler(new Request("http://localhost/api/races/missing"), {
    params: { id: "missing" },
  })

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: "Race not found" })
  assert.deepEqual(called, [])
})
