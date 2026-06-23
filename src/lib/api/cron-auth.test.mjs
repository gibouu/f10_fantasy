import test from "node:test"
import assert from "node:assert/strict"

import { validateCronSecret } from "./cron-auth.js"

function requestWithAuthorization(authorization) {
  return new Request("http://localhost/api/cron/test", {
    headers:
      authorization === undefined
        ? {}
        : {
            authorization,
          },
  })
}

test("validateCronSecret accepts an exact Bearer token match", () => {
  assert.equal(
    validateCronSecret(requestWithAuthorization("Bearer expected"), () => "expected"),
    true,
  )
})

test("validateCronSecret rejects missing configured secrets", () => {
  assert.equal(
    validateCronSecret(requestWithAuthorization("Bearer expected"), () => undefined),
    false,
  )
})

test("validateCronSecret requires the Bearer scheme and exact token", () => {
  for (const authorization of [
    undefined,
    "expected",
    "bearer expected",
    "Bearer wrong",
    "Bearer expected extra",
  ]) {
    assert.equal(
      validateCronSecret(requestWithAuthorization(authorization), () => "expected"),
      false,
    )
  }
})
