import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./segmented-control.tsx", import.meta.url), "utf8")

test("SegmentedControl exposes selected button state to assistive technology", () => {
  assert.match(source, /role="group"/)
  assert.match(source, /aria-pressed=\{isActive\}/)
})

test("SegmentedControl scopes the active pill layout id per instance", () => {
  assert.match(source, /React\.useId\(\)/)
  assert.match(source, /const activePillLayoutId = `segmented-control-pill-\$\{controlId\}`/)
  assert.match(source, /layoutId=\{activePillLayoutId\}/)
  assert.doesNotMatch(source, /layoutId="segmented-control-pill"/)
})
