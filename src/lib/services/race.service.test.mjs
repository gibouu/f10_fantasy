import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./race.service.ts", import.meta.url), "utf8")
const getRaceByIdBody = source.match(
  /export async function getRaceById[\s\S]*?const race = await db\.race\.findUnique\(\{([\s\S]*?)\n  \}\)/,
)?.[1]
const getRaceEntrantsStart = source.indexOf("export async function getRaceEntrants")
const getRaceResultsStart = source.indexOf("export async function getRaceResults")
const getRaceEntrantsBody =
  getRaceEntrantsStart >= 0 && getRaceResultsStart > getRaceEntrantsStart
    ? source.slice(getRaceEntrantsStart, getRaceResultsStart)
    : null

assert.ok(getRaceByIdBody, "expected to find getRaceById findUnique query")
assert.ok(getRaceEntrantsBody, "expected to find getRaceEntrants body")

test("getRaceById selects qualifyingStartUtc for race detail serialization", () => {
  assert.match(getRaceByIdBody, /qualifyingStartUtc:\s*true/)
})

test("getRaceEntrants lets qualifying result lookup failures surface", () => {
  assert.match(getRaceEntrantsBody, /db\.qualifyingResult\s*\.\s*findMany/)
  assert.doesNotMatch(getRaceEntrantsBody, /\.catch\(\(\) => \[\]\)/)
})
