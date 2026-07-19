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

test("GET keeps a worst-case 22 by 24 driver-history response within the payload budget", async () => {
  const longestFixtureStrings = {
    raceName: "Formula 1 Qatar Airways Grand Prix du Canada 2026",
    circuitName: "Circuit de Spa-Francorchamps, Stavelot, Belgium",
    country: "Kingdom of Belgium",
    constructorName: "Aston Martin Aramco Formula One Team",
    constructorShortName: "ASTON MARTIN",
    constructorSlug: "aston-martin-aramco-formula-one-team",
  }
  const historyStatuses = ["CLASSIFIED", "DNF", "DNS", "DSQ"]
  const entrants = Array.from({ length: 22 }, (_, entrantIndex) => ({
    ...entrant,
    id: `driver-${String(entrantIndex + 1).padStart(2, "0")}`,
    code: `D${String(entrantIndex + 1).padStart(2, "0")}`,
    firstName: "Maximilian-Alexander",
    lastName: "Hohenlohe-Langenburg",
    photoUrl: "/drivers/maximilian-alexander-hohenlohe-langenburg.png",
    seatKey: `aston-martin-aramco-formula-one-team:${entrantIndex + 1}`,
    constructor: {
      ...entrant.constructor,
      id: "aston-martin-aramco-formula-one-team",
      name: longestFixtureStrings.constructorName,
      shortName: longestFixtureStrings.constructorShortName,
      slug: longestFixtureStrings.constructorSlug,
      logoUrl: "/teamlogos/aston-martin-aramco-formula-one-team.webp",
    },
  }))
  const seasonForms = new Map(
    entrants.map((driver) => [
      driver.id,
      {
        averageFinish: 10.5,
        nonClassifiedCount: 18,
        results: Array.from({ length: 24 }, (_, historyIndex) => {
          const status = historyStatuses[historyIndex % historyStatuses.length]
          return {
            driverId: driver.id,
            raceId: `grand-prix-${String(24 - historyIndex).padStart(2, "0")}`,
            raceName: longestFixtureStrings.raceName,
            scheduledStartUtc: new Date(
              Date.UTC(2026, 6, 5 - historyIndex, 14, 0, 0),
            ),
            position: status === "CLASSIFIED" ? (historyIndex % 20) + 1 : null,
            status,
          }
        }),
      },
    ]),
  )
  const getHandler = createRaceDetailGetHandler({
    getRaceById: async () => ({
      ...race,
      name: longestFixtureStrings.raceName,
      circuitName: longestFixtureStrings.circuitName,
      country: longestFixtureStrings.country,
    }),
    getRaceEntrants: async () => entrants,
    getDriverSeasonStats: async () => seasonForms,
    findRaceResults: async () => [],
    getQualifyingResults: async () => [],
    getResultScoreGuide: () => ({ p10: 0, winner: 0, dnf: 0 }),
  })

  const response = await getHandler(new Request("http://localhost/api/races/belgium"), {
    params: { id: "belgium" },
  })
  const body = await response.json()
  const responseBytes = Buffer.byteLength(JSON.stringify(body))

  assert.equal(response.status, 200)
  assert.equal(body.entrants.length, 22)
  assert.ok(body.entrants.every((driver) => driver.seasonResults.length === 24))
  assert.ok(
    responseBytes <= 131_072,
    `race detail response is ${responseBytes} bytes (limit 131072)`,
  )
})

test("GET propagates qualifying lookup failures", async () => {
  const qualifyingFailure = new Error("qualifying lookup failed")
  const getHandler = createRaceDetailGetHandler({
    getRaceById: async () => race,
    getRaceEntrants: async () => [entrant],
    getDriverSeasonStats: async () => new Map(),
    findRaceResults: async () => [],
    getQualifyingResults: async () => {
      throw qualifyingFailure
    },
    getResultScoreGuide: () => ({ p10: 0, winner: 0, dnf: 0 }),
  })

  await assert.rejects(
    () => getHandler(new Request("http://localhost/api/races/belgium"), {
      params: { id: "belgium" },
    }),
    qualifyingFailure,
  )
})
