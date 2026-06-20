import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./[raceId]/page.tsx", import.meta.url), "utf8")

test("race detail sign-in callback URL encodes the dynamic race id path", () => {
  assert.match(source, /encodeURIComponent\(`\/races\/\$\{params\.raceId\}`\)/)
  assert.doesNotMatch(source, /href=\{`\/signin\?callbackUrl=\/races\/\$\{params\.raceId\}`\}/)
})
