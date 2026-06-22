import test from "node:test"
import assert from "node:assert/strict"

import { authedDeps, jsonRequest, rawRequest, responseJson } from "../test-utils.mjs"
import { handlePickPost } from "./post-handler.js"

function dependencies(overrides = {}) {
  return {
    ...authedDeps("user-1"),
    createPickSchema: { parse: (body) => body },
    isValidationError: () => false,
    getValidationIssues: () => [],
    logger: { error: () => {} },
    ...overrides,
  }
}

function pickRequest(body) {
  return jsonRequest("http://localhost/api/picks", body)
}

function rawPickRequest(body) {
  return rawRequest("http://localhost/api/picks", body)
}

test("POST returns a generic 500 for unexpected pick save failures", async () => {
  const logs = []
  const response = await handlePickPost(pickRequest({ raceId: "race-1" }), dependencies({
    createOrUpdatePick: async () => {
      throw new Error("Prisma connection string leaked")
    },
    logger: { error: (...args) => logs.push(args) },
  }))

  assert.equal(response.status, 500)
  assert.deepEqual(await responseJson(response), { error: "Failed to save pick" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("Prisma connection"), true)
})

test("POST rejects non-object pick bodies before validation", async () => {
  const response = await handlePickPost(pickRequest([]), dependencies({
    createPickSchema: {
      parse: () => {
        throw new Error("schema should not parse non-object bodies")
      },
    },
    createOrUpdatePick: async () => {
      throw new Error("createOrUpdatePick should not run")
    },
  }))

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "Request body must be a JSON object" })
})

test("POST rejects malformed pick JSON before validation", async () => {
  const response = await handlePickPost(rawPickRequest("{"), dependencies({
    createPickSchema: {
      parse: () => {
        throw new Error("schema should not parse malformed JSON")
      },
    },
  }))

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "Invalid JSON body" })
})

test("POST preserves locked race domain errors", async () => {
  const response = await handlePickPost(pickRequest({ raceId: "race-1" }), dependencies({
    createOrUpdatePick: async () => {
      throw new Error("Race is locked")
    },
  }))

  assert.equal(response.status, 423)
  assert.deepEqual(await responseJson(response), { error: "Race is locked" })
})

test("POST preserves pick validation domain errors", async () => {
  const response = await handlePickPost(pickRequest({ raceId: "race-1" }), dependencies({
    createOrUpdatePick: async () => {
      throw new Error("The following driver IDs are not registered entrants for this race: driver-1")
    },
  }))

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), {
    error: "The following driver IDs are not registered entrants for this race: driver-1",
  })
})
