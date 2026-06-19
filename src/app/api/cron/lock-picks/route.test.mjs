import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8")

test("lock-picks promotes races to LIVE with a compare-and-set status guard", () => {
  assert.match(source, /db\.race\.updateMany\(\{/)
  assert.match(source, /where:\s*\{\s*id:\s*race\.id,\s*status:\s*"UPCOMING"\s*\}/s)
  assert.match(source, /data:\s*\{\s*status:\s*newStatus\s*\}/s)
})
