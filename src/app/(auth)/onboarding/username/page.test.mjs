import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8")

test("onboarding username availability ignores stale async responses", () => {
  assert.match(page, /availabilityRequestRef = useRef\(0\)/)
  assert.match(page, /const requestId = \+\+availabilityRequestRef\.current/)
  assert.match(page, /availabilityRequestRef\.current !== requestId/)
  assert.match(page, /availabilityRequestRef\.current === requestId/)
})

test("onboarding username suggestions ignore non-success and malformed payloads", () => {
  assert.match(page, /if \(!r\.ok\) return \[\]/)
  assert.match(page, /Array\.isArray\(suggestions\)/)
  assert.doesNotMatch(page, /setSuggestions\(data\.suggestions\)/)
})

test("onboarding username availability treats HTTP failures as verification errors", () => {
  assert.match(
    page,
    /const res = await fetch\([\s\S]+?\)\s+if \(!res\.ok\) throw new Error\("Couldn't verify username\. Please try again\."\)\s+const data/,
  )
})
