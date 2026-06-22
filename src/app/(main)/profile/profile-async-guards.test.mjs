import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("username availability checks ignore stale async responses", async () => {
  for (const path of ["./UsernameSetForm.tsx", "./UsernameChangeForm.tsx"]) {
    const text = await source(path)
    assert.match(text, /availabilityRequestRef = useRef\(0\)/)
    assert.match(text, /const requestId = \+\+availabilityRequestRef\.current/)
    assert.match(text, /availabilityRequestRef\.current !== requestId/)
  }
})

test("team picker ignores stale async save responses", async () => {
  const text = await source("./TeamPicker.tsx")
  assert.match(text, /saveRequestRef = React\.useRef\(0\)/)
  assert.match(text, /const requestId = \+\+saveRequestRef\.current/)
  assert.match(text, /saveRequestRef\.current !== requestId/)
  assert.doesNotMatch(text, /setSelected\(selected\) \/\/ revert/)
})

test("friend profile API key encodes dynamic user ids", async () => {
  const text = await source("./[userId]/page.tsx")

  assert.match(text, /`\/api\/users\/\$\{encodeURIComponent\(userId\)\}`/)
  assert.doesNotMatch(text, /`\/api\/users\/\$\{userId\}`/)
})
