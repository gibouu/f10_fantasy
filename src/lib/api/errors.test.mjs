import test from "node:test"
import assert from "node:assert/strict"

import { sanitizedErrorResponse } from "./errors.js"

test("sanitizedErrorResponse preserves allowlisted domain errors", async () => {
  const response = sanitizedErrorResponse(new Error("Race is locked"), {
    domainErrors: [{ pattern: /locked/, status: 423 }],
    fallbackMessage: "Failed to save pick",
  })

  assert.equal(response.status, 423)
  assert.deepEqual(await response.json(), { error: "Race is locked" })
})

test("sanitizedErrorResponse treats reused global regex rules as stateless", async () => {
  const domainErrors = [{ pattern: /locked/g, status: 423 }]

  const firstResponse = sanitizedErrorResponse(new Error("Race is locked"), {
    domainErrors,
    fallbackMessage: "Failed to save pick",
    logger: null,
  })
  const secondResponse = sanitizedErrorResponse(new Error("Race is locked"), {
    domainErrors,
    fallbackMessage: "Failed to save pick",
    logger: null,
  })

  assert.equal(firstResponse.status, 423)
  assert.equal(secondResponse.status, 423)
})

test("sanitizedErrorResponse logs unexpected errors and returns a generic body", async () => {
  const logs = []
  const response = sanitizedErrorResponse(
    new Error("Prisma password leaked"),
    {
      fallbackMessage: "Failed to save pick",
      logger: { error: (...args) => logs.push(args) },
      logMessage: "Failed to save pick",
    },
  )

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Failed to save pick" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("Prisma password"), true)
})
