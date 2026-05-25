import test from "node:test"
import assert from "node:assert/strict"

import { handlePickPost } from "./post-handler.js"

function jsonRequest(body) {
  return new Request("http://localhost/api/picks", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

function dependencies(overrides = {}) {
  return {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    createPickSchema: { parse: (body) => body },
    isValidationError: () => false,
    getValidationIssues: () => [],
    logger: { error: () => {} },
    ...overrides,
  }
}

test("POST returns a generic 500 for unexpected pick save failures", async () => {
  const logs = []
  const response = await handlePickPost(jsonRequest({ raceId: "race-1" }), dependencies({
    createOrUpdatePick: async () => {
      throw new Error("Prisma connection string leaked")
    },
    logger: { error: (...args) => logs.push(args) },
  }))

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Failed to save pick" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("Prisma connection"), true)
})

test("POST preserves locked race domain errors", async () => {
  const response = await handlePickPost(jsonRequest({ raceId: "race-1" }), dependencies({
    createOrUpdatePick: async () => {
      throw new Error("Race is locked")
    },
  }))

  assert.equal(response.status, 423)
  assert.deepEqual(await response.json(), { error: "Race is locked" })
})
