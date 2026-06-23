import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

async function loadResolutionModule() {
  const source = await readFile(
    new URL("./scoring-pick-resolution.ts", import.meta.url),
    "utf8",
  )
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const encoded = Buffer.from(outputText).toString("base64")
  return import(`data:text/javascript;base64,${encoded}`)
}

const { resolveSeatKeyForScoring } = await loadResolutionModule()

test("locked picks keep a stored locked seat key without live inference", () => {
  let inferred = false

  const seatKey = resolveSeatKeyForScoring({
    storedSeatKey: "ferrari:44",
    lockedDriverId: "driver-44",
    inferSeatKeyFromLiveDriver: () => {
      inferred = true
      return "live:1"
    },
  })

  assert.equal(seatKey, "ferrari:44")
  assert.equal(inferred, false)
})

test("locked picks without a stored seat key fall back to locked driver id", () => {
  let inferred = false

  const seatKey = resolveSeatKeyForScoring({
    storedSeatKey: null,
    lockedDriverId: "driver-44",
    inferSeatKeyFromLiveDriver: () => {
      inferred = true
      return "live:1"
    },
  })

  assert.equal(seatKey, null)
  assert.equal(inferred, false)
})

test("unlocked picks may infer a seat key from the live relation", () => {
  const seatKey = resolveSeatKeyForScoring({
    storedSeatKey: null,
    lockedDriverId: null,
    inferSeatKeyFromLiveDriver: () => "live:1",
  })

  assert.equal(seatKey, "live:1")
})
