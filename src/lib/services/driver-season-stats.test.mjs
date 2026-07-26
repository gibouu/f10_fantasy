import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const findManyCalls = []

globalThis.__driverSeasonStatsTestDeps = {
  db: {
    raceResult: {
      async findMany(options) {
        findManyCalls.push(options)
        return [
          {
            driverId: "norris",
            raceId: "britain",
            position: 5,
            status: "CLASSIFIED",
            race: {
              name: "British Grand Prix",
              scheduledStartUtc: new Date("2026-07-05T14:00:00.000Z"),
            },
          },
          {
            driverId: "norris",
            raceId: "austria",
            position: null,
            status: "DNF",
            race: {
              name: "Austrian Grand Prix",
              scheduledStartUtc: new Date("2026-06-28T13:00:00.000Z"),
            },
          },
          {
            driverId: "norris",
            raceId: "canada",
            position: 2,
            status: "CLASSIFIED",
            race: {
              name: "Canadian Grand Prix",
              scheduledStartUtc: new Date("2026-06-14T18:00:00.000Z"),
            },
          },
          {
            driverId: "norris",
            raceId: "monaco",
            position: null,
            status: "DSQ",
            race: {
              name: "Monaco Grand Prix",
              scheduledStartUtc: new Date("2026-05-24T13:00:00.000Z"),
            },
          },
          {
            driverId: "leclerc",
            raceId: "britain",
            position: 1,
            status: "CLASSIFIED",
            race: {
              name: "British Grand Prix",
              scheduledStartUtc: new Date("2026-07-05T14:00:00.000Z"),
            },
          },
        ]
      },
    },
  },
}

async function loadStatsModule() {
  const source = await readFile(
    new URL("./driver-season-stats.ts", import.meta.url),
    "utf8",
  )
  const prepared = source
    .replace(
      "import { db } from '@/lib/db/client'",
      "const { db } = globalThis.__driverSeasonStatsTestDeps",
    )
    .replace(/import type \{[^\n]+\} from '@\/types\/domain'\n/, "")

  const { outputText } = ts.transpileModule(prepared, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const encoded = Buffer.from(outputText).toString("base64")
  return import(`data:text/javascript;base64,${encoded}`)
}

test("season form reads earlier completed races of the same type once and retains result history", async () => {
  findManyCalls.length = 0
  const { getDriverSeasonStats } = await loadStatsModule()
  const before = new Date("2026-07-19T13:00:00.000Z")

  const stats = await getDriverSeasonStats({
    seasonId: "season-2026",
    raceType: "MAIN",
    before,
  })

  assert.deepEqual(stats.get("norris"), {
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
      {
        driverId: "norris",
        raceId: "canada",
        raceName: "Canadian Grand Prix",
        scheduledStartUtc: new Date("2026-06-14T18:00:00.000Z"),
        position: 2,
        status: "CLASSIFIED",
      },
      {
        driverId: "norris",
        raceId: "monaco",
        raceName: "Monaco Grand Prix",
        scheduledStartUtc: new Date("2026-05-24T13:00:00.000Z"),
        position: null,
        status: "DSQ",
      },
    ],
  })
  assert.deepEqual(stats.get("leclerc"), {
    averageFinish: 1,
    nonClassifiedCount: 0,
    results: [
      {
        driverId: "leclerc",
        raceId: "britain",
        raceName: "British Grand Prix",
        scheduledStartUtc: new Date("2026-07-05T14:00:00.000Z"),
        position: 1,
        status: "CLASSIFIED",
      },
    ],
  })

  assert.equal(findManyCalls.length, 1)
  assert.deepEqual(findManyCalls[0].where.race, {
    seasonId: "season-2026",
    type: "MAIN",
    status: "COMPLETED",
    scheduledStartUtc: { lt: before },
  })
  assert.deepEqual(findManyCalls[0].select, {
    driverId: true,
    raceId: true,
    position: true,
    status: true,
    race: { select: { name: true, scheduledStartUtc: true } },
  })
  assert.deepEqual(findManyCalls[0].orderBy, [
    { race: { scheduledStartUtc: "desc" } },
    { raceId: "desc" },
    { driverId: "asc" },
  ])
})
