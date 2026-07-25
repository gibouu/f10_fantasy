import test from "node:test"
import assert from "node:assert/strict"

import { authedDeps, jsonRequest, rawRequest, responseJson } from "../test-utils.mjs"
import { handlePickPost } from "./post-handler.js"

function dependencies(overrides = {}) {
  return {
    ...authedDeps("user-1"),
    createPickSchema: { parse: (body) => body },
    createOrUpdatePick: async () => ({ id: "pick-1", version: "version-1" }),
    isValidationError: () => false,
    getValidationIssues: () => [],
    logger: { error: () => {} },
    ...overrides,
  }
}

function pickRequest(body, options = {}) {
  return jsonRequest("http://localhost/api/picks", body, options)
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

test("POST preserves cancelled race domain errors", async () => {
  const response = await handlePickPost(pickRequest({ raceId: "race-1" }), dependencies({
    createOrUpdatePick: async () => {
      throw new Error("Race race-1 is cancelled — picks can no longer be submitted")
    },
  }))

  assert.equal(response.status, 409)
  assert.deepEqual(await responseJson(response), {
    error: "Race race-1 is cancelled — picks can no longer be submitted",
  })
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

test("POST passes If-Match as the pick base version and returns the saved version", async () => {
  let receivedInput
  const response = await handlePickPost(
    pickRequest(
      { raceId: "race-1", baseVersion: "body-version" },
      { headers: { "if-match": "\"header-version\"" } },
    ),
    dependencies({
      createOrUpdatePick: async (_userId, input) => {
        receivedInput = input
        return { id: "pick-1", version: "saved-version" }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("etag"), "\"saved-version\"")
  assert.equal(receivedInput.baseVersion, "header-version")
})

test("POST returns recoverable pick conflicts with the current server pick", async () => {
  const currentPick = {
    id: "pick-1",
    raceId: "race-1",
    version: "server-version",
    winnerDriverId: "winner",
    tenthPlaceDriverId: "p10",
    dnfDriverId: "dnf",
  }
  const response = await handlePickPost(pickRequest({ raceId: "race-1" }), dependencies({
    createOrUpdatePick: async () => {
      const err = new Error("Pick has changed since it was loaded; refresh and try again")
      err.name = "PickConflictError"
      err.currentPick = currentPick
      throw err
    },
  }))

  assert.equal(response.status, 409)
  assert.equal(response.headers.get("etag"), "\"server-version\"")
  assert.deepEqual(await responseJson(response), {
    error: "Pick has changed since it was loaded; refresh and try again",
    currentPick,
  })
})
