import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

async function loadFormulaModule() {
  const source = await readFile(new URL("./formula.ts", import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const encoded = Buffer.from(outputText).toString("base64")
  return import(`data:text/javascript;base64,${encoded}`)
}

const formula = await loadFormulaModule()

function result(driverNumber, position, status = "CLASSIFIED") {
  return { driverNumber, position, status }
}

test("computeRaceScore applies main-race P10, winner, and DNF scoring", () => {
  const score = formula.computeRaceScore(
    {
      tenthPlaceDriverId: "p10",
      winnerDriverId: "winner",
      dnfDriverId: "dnf",
    },
    new Map([
      ["p10", 10],
      ["winner", 1],
      ["dnf", 44],
    ]),
    {
      raceType: "MAIN",
      results: [
        result(10, 10),
        result(1, 1),
        result(44, null, "DNF"),
      ],
    },
  )

  assert.deepEqual(score, {
    tenthPlaceScore: 25,
    winnerBonus: 5,
    dnfBonus: 3,
    totalScore: 33,
  })
})

test("main-race P10 scoring handles distance, out-of-range, and non-classified results", () => {
  assert.equal(formula.computeTenthPlaceScoreForResult(result(9, 9), "MAIN"), 18)
  assert.equal(formula.computeTenthPlaceScoreForResult(result(18, 18), "MAIN"), 2)
  assert.equal(formula.computeTenthPlaceScoreForResult(result(1, 1), "MAIN"), 0)
  assert.equal(formula.computeTenthPlaceScoreForResult(result(10, 10, "DNF"), "MAIN"), 0)
})

test("computeRaceScore applies sprint P10, winner, and DNF scoring", () => {
  const score = formula.computeRaceScore(
    {
      tenthPlaceDriverId: "p10",
      winnerDriverId: "winner",
      dnfDriverId: "dnf",
    },
    new Map([
      ["p10", 10],
      ["winner", 1],
      ["dnf", 63],
    ]),
    {
      raceType: "SPRINT",
      results: [
        result(10, 10),
        result(1, 1),
        result(63, null, "DNS"),
      ],
    },
  )

  assert.deepEqual(score, {
    tenthPlaceScore: 8,
    winnerBonus: 2,
    dnfBonus: 1,
    totalScore: 11,
  })
})

test("sprint P10 scoring uses the sprint distance formula", () => {
  assert.equal(formula.computeTenthPlaceScoreForResult(result(9, 9), "SPRINT"), 7)
  assert.equal(formula.computeTenthPlaceScoreForResult(result(3, 3), "SPRINT"), 1)
  assert.equal(formula.computeTenthPlaceScoreForResult(result(2, 2), "SPRINT"), 0)
  assert.equal(formula.computeTenthPlaceScoreForResult(result(10, 10, "DSQ"), "SPRINT"), 0)
})

test("computeRaceScore scores missing driver-map entries as zero", () => {
  const score = formula.computeRaceScore(
    {
      tenthPlaceDriverId: "missing-p10",
      winnerDriverId: "missing-winner",
      dnfDriverId: "missing-dnf",
    },
    new Map(),
    {
      raceType: "MAIN",
      results: [
        result(10, 10),
        result(1, 1),
        result(44, null, "DNF"),
      ],
    },
  )

  assert.deepEqual(score, {
    tenthPlaceScore: 0,
    winnerBonus: 0,
    dnfBonus: 0,
    totalScore: 0,
  })
})

test("getScoringCaps returns the documented maximums", () => {
  assert.deepEqual(formula.getScoringCaps("MAIN"), {
    p10: 25,
    winner: 5,
    dnf: 3,
    total: 33,
  })
  assert.deepEqual(formula.getScoringCaps("SPRINT"), {
    p10: 8,
    winner: 2,
    dnf: 1,
    total: 11,
  })
})

test("getResultScoreGuide stays aligned with per-result scoring rules", () => {
  assert.deepEqual(formula.getResultScoreGuide(result(1, 1), "MAIN"), {
    p10: 0,
    winner: 5,
    dnf: 0,
  })
  assert.deepEqual(formula.getResultScoreGuide(result(10, 10), "SPRINT"), {
    p10: 8,
    winner: 0,
    dnf: 0,
  })
  assert.deepEqual(formula.getResultScoreGuide(result(44, null, "DNF"), "MAIN"), {
    p10: 0,
    winner: 0,
    dnf: 3,
  })
})
