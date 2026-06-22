import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8")

test("lock-picks promotes races to LIVE with a compare-and-set status guard", () => {
  assert.match(source, /db\.race\.updateMany\(\{/)
  assert.match(source, /where:\s*\{\s*id:\s*race\.id,\s*status:\s*"UPCOMING"\s*\}/s)
  assert.match(source, /data:\s*\{\s*status:\s*newStatus\s*\}/s)
})

test("lock-picks deployment notes point maintainers to AWS Lambda scheduling", () => {
  assert.match(source, /AWS Lambda/)
  assert.doesNotMatch(source, /vercel\.json/i)
  assert.doesNotMatch(source, /Vercel Cron/i)
})
