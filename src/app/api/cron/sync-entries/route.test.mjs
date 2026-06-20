import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8")

test("sync-entries only selects race statuses whose grids can still change", () => {
  assert.match(route, /status:\s*\{\s*in:\s*\[\s*'UPCOMING',\s*'LIVE'\s*\]/s)
  assert.doesNotMatch(route, /status:\s*\{\s*not:\s*'COMPLETED'\s*\}/)
})
