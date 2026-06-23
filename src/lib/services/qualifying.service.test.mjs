import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./qualifying.service.ts", import.meta.url), "utf8")

const targetQuery = source.match(
  /export async function findRacesNeedingQualifyingIngestion[\s\S]+?return races\.map/,
)?.[0]

test("qualifying target query defers zero-row retries until qualifying has started", () => {
  assert.ok(targetQuery, "findRacesNeedingQualifyingIngestion source not found")
  assert.match(targetQuery, /r\."qualifyingStartUtc"\s+<=\s+NOW\(\)/)
  assert.match(targetQuery, /q\.cnt IS NULL/)
})

test("qualifying target query preserves stale partial-row retries", () => {
  assert.ok(targetQuery, "findRacesNeedingQualifyingIngestion source not found")
  assert.match(
    targetQuery,
    /q\.cnt < 18 AND q\.last_updated < NOW\(\) - INTERVAL '15 minutes'/,
  )
})
