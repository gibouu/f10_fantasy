import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8")

test("privacy page keeps required support and unaffiliated notices", () => {
  assert.match(page, /title:\s*['"]Privacy Policy .* FX Racing['"]/)
  assert.match(page, /href=["']mailto:support@fxracing\.ca["']/)
  assert.match(page, /not affiliated with/)
  assert.match(page, /Formula 1/)
})
