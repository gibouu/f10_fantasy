import test from "node:test"
import assert from "node:assert/strict"

import {
  redactClientErrorText,
  sanitizeClientErrorPayload,
} from "./client-errors.js"

test("redacts obvious sensitive values from client error text", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.abcdefghijklmnopqrstuvwxyz"
  const source = `Failed for user test@example.com with Bearer ${jwt} at 3f7ef00d-2f57-4f28-94ec-5c7db018a0db`

  const redacted = redactClientErrorText(source)

  assert.doesNotMatch(redacted, /test@example\.com/)
  assert.doesNotMatch(redacted, new RegExp(jwt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(redacted, /3f7ef00d-2f57-4f28-94ec-5c7db018a0db/)
  assert.match(redacted, /\[redacted-email\]/)
  assert.match(redacted, /Bearer \[redacted-token\]/)
  assert.match(redacted, /\[redacted-id\]/)
})

test("limits client error text length", () => {
  const redacted = redactClientErrorText("x".repeat(900))

  assert.equal(redacted.length, 500)
})

test("sanitizes client error payloads without query strings", () => {
  const event = sanitizeClientErrorPayload({
    kind: "unhandledrejection",
    message: "Fetch failed for person@example.com",
    path: "/races/1?token=secret#details",
    digest: "digest-3f7ef00d-2f57-4f28-94ec-5c7db018a0db",
  })

  assert.deepEqual(event, {
    kind: "unhandledrejection",
    message: "Fetch failed for [redacted-email]",
    path: "/races/1",
    digest: "digest-[redacted-id]",
  })
})

test("rejects invalid client error payloads", () => {
  assert.equal(sanitizeClientErrorPayload(null), null)
  assert.equal(sanitizeClientErrorPayload([]), null)
  assert.equal(sanitizeClientErrorPayload({ message: "" }), null)
})
