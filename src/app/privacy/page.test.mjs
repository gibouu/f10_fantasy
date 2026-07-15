import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8")

test("privacy page keeps required support and unaffiliated notices", () => {
  assert.match(page, /title:\s*{\s*absolute:\s*['"]Privacy Policy .* FX Racing['"]\s*}/)
  assert.match(page, /href=["']mailto:support@fxracing\.ca["']/)
  assert.match(page, /not affiliated with/)
  assert.match(page, /Formula 1/)
})

test("privacy page exposes a terms anchor for sign-in legal links", () => {
  assert.match(page, /id=["']terms["']/)
  assert.match(page, /Terms of Use/)
})

test("privacy owns its route metadata", () => {
  assert.match(page, /alternates:\s*{\s*canonical:\s*["']\/privacy["']\s*}/)
  assert.match(page, /openGraph:\s*{\s*url:\s*["']\/privacy["']\s*}/)
})
