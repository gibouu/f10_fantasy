import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const groupByCalls = []

globalThis.__driverSeasonStatsTestDeps = {
  db: {
    raceResult: {
      async groupBy(options) {
        groupByCalls.push(options)

        if (options._avg) {
          return [
            { driverId: "norris", _avg: { position: 3.25 } },
            { driverId: "leclerc", _avg: { position: 5 } },
          ]
        }

        return [
          { driverId: "norris", _count: { _all: 1 } },
          { driverId: "antonelli", _count: { _all: 2 } },
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

test("season form aggregates earlier completed races of the same type for the whole field", async () => {
  groupByCalls.length = 0
  const { getDriverSeasonStats } = await loadStatsModule()
  const before = new Date("2026-07-19T13:00:00.000Z")

  const stats = await getDriverSeasonStats({
    seasonId: "season-2026",
    raceType: "MAIN",
    before,
  })

  assert.deepEqual(stats.get("norris"), {
    averageFinish: 3.25,
    dnfCount: 1,
  })
  assert.deepEqual(stats.get("leclerc"), {
    averageFinish: 5,
    dnfCount: 0,
  })
  assert.deepEqual(stats.get("antonelli"), {
    averageFinish: null,
    dnfCount: 2,
  })

  assert.equal(groupByCalls.length, 2)
  for (const call of groupByCalls) {
    assert.deepEqual(call.by, ["driverId"])
    assert.deepEqual(call.where.race, {
      seasonId: "season-2026",
      type: "MAIN",
      status: "COMPLETED",
      scheduledStartUtc: { lt: before },
    })
  }
  assert.equal(groupByCalls[0].where.status, "CLASSIFIED")
  assert.deepEqual(groupByCalls[0].where.position, { not: null })
  assert.deepEqual(groupByCalls[1].where.status, { not: "CLASSIFIED" })
})
