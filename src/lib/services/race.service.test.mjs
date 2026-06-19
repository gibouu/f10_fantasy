import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./race.service.ts", import.meta.url), "utf8")
const getRaceByIdBody = source.match(
  /export async function getRaceById[\s\S]*?const race = await db\.race\.findUnique\(\{([\s\S]*?)\n  \}\)/,
)?.[1]

assert.ok(getRaceByIdBody, "expected to find getRaceById findUnique query")

test("getRaceById selects qualifyingStartUtc for race detail serialization", () => {
  assert.match(getRaceByIdBody, /qualifyingStartUtc:\s*true/)
})
