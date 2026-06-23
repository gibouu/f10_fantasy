import test from "node:test"
import assert from "node:assert/strict"

import { authedDeps, jsonRequest, rawRequest, responseJson } from "../../test-utils.mjs"
import { handleUsersTeamPatch } from "./patch-handler.js"

function teamRequest(body) {
  return jsonRequest("http://localhost/api/users/team", body, { method: "PATCH" })
}

function dependencies(overrides = {}) {
  return {
    ...authedDeps("user-1"),
    setFavoriteTeam: async () => {
      throw new Error("setFavoriteTeam should not run")
    },
    ...overrides,
  }
}

test("PATCH rejects malformed team bodies without clearing the saved team", async () => {
  const response = await handleUsersTeamPatch(
    rawRequest("http://localhost/api/users/team", "{", { method: "PATCH" }),
    dependencies(),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "Invalid JSON body" })
})

test("PATCH rejects missing team bodies without clearing the saved team", async () => {
  const response = await handleUsersTeamPatch(
    rawRequest("http://localhost/api/users/team", "", { method: "PATCH" }),
    dependencies(),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "Invalid JSON body" })
})

test("PATCH requires the slug property before updating the saved team", async () => {
  const response = await handleUsersTeamPatch(teamRequest({}), dependencies())

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "slug is required" })
})

test("PATCH accepts explicit null as a saved team clear", async () => {
  const calls = []
  const response = await handleUsersTeamPatch(teamRequest({ slug: null }), dependencies({
    setFavoriteTeam: async (...args) => {
      calls.push(args)
    },
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), { ok: true })
  assert.deepEqual(calls, [["user-1", null]])
})

test("PATCH updates the saved team for string slugs", async () => {
  const calls = []
  const response = await handleUsersTeamPatch(teamRequest({ slug: "ferrari" }), dependencies({
    setFavoriteTeam: async (...args) => {
      calls.push(args)
    },
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), { ok: true })
  assert.deepEqual(calls, [["user-1", "ferrari"]])
})

test("PATCH sanitizes unexpected saved team failures", async () => {
  const logs = []
  const response = await handleUsersTeamPatch(teamRequest({ slug: "ferrari" }), dependencies({
    setFavoriteTeam: async () => {
      throw new Error("DATABASE_URL leaked")
    },
    logger: { error: (...args) => logs.push(args) },
  }))

  assert.equal(response.status, 500)
  assert.deepEqual(await responseJson(response), { error: "Failed to update team" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("DATABASE_URL"), true)
})
