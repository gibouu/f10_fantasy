import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Races/RacesListViewModel.swift", import.meta.url),
  "utf8",
)

test("RacesListViewModel orders completed races by scheduled start descending", () => {
  const pastBlock = source.match(/var past:\s*\[Race\]\s*\{[\s\S]*?\n    \}/)?.[0]

  assert.ok(pastBlock, "past race computed property should exist")
  assert.match(pastBlock, /\.filter\s*\{\s*\$0\.status\s*==\s*\.completed\s*\}/)
  assert.match(
    pastBlock,
    /\.sorted\s*\{\s*\$0\.scheduledStartUtc\s*>\s*\$1\.scheduledStartUtc\s*\}/,
    "completed races should be sorted by actual start time, not just round",
  )
  assert.doesNotMatch(
    pastBlock,
    /\.sorted\s*\{\s*\$0\.round\s*>\s*\$1\.round\s*\}/,
    "round-only sorting cannot order sprint and main races from the same weekend",
  )
})
