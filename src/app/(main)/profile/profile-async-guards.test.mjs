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

test("username availability checks treat HTTP failures as verification errors", async () => {
  for (const path of ["./UsernameSetForm.tsx", "./UsernameChangeForm.tsx"]) {
    const text = await source(path)
    assert.match(
      text,
      /const res = await fetch\([\s\S]+?\)\s+if \(!res\.ok\) throw new Error\("Couldn't verify username\. Please try again\."\)\s+const data/,
    )
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

test("friend profile header passes API avatar URLs to Avatar", async () => {
  const text = await source("./[userId]/page.tsx")

  assert.match(
    text,
    /<Avatar[\s\S]*src=\{user\.avatarUrl\}/,
    "profile header should render the avatar URL returned by the API",
  )
})

test("friend profile fetcher preserves non-OK HTTP status", async () => {
  const text = await source("./[userId]/page.tsx")

  assert.match(text, /class ProfileApiError extends Error/)
  assert.match(text, /if \(!response\.ok\) {[\s\S]*throw new ProfileApiError\(response\.status/)
  assert.doesNotMatch(text, /fetch\(url\)\.then\(\(r\) => r\.json\(\)\)/)
})

test("friend profile renders not-found separately from API failures", async () => {
  const text = await source("./[userId]/page.tsx")

  assert.match(text, /const notFound = error instanceof ProfileApiError && error\.status === 404/)
  assert.match(text, /if \(notFound\) {[\s\S]*Player not found\./)
  assert.match(text, /if \(error \|\| !data\?\.user\) {[\s\S]*Unable to load profile\./)
})
