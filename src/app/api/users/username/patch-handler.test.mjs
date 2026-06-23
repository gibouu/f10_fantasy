import test from "node:test"
import assert from "node:assert/strict"

import { authedDeps, jsonRequest, responseJson } from "../../test-utils.mjs"
import { handleUsernamePatch } from "./patch-handler.js"

function usernameRequest(body) {
  return jsonRequest("http://localhost/api/users/username", body, { method: "PATCH" })
}

function dependencies(overrides = {}) {
  return {
    ...authedDeps("user-1"),
    changeUsername: async () => {
      throw new Error("changeUsername should not run")
    },
    ...overrides,
  }
}

test("PATCH rejects valid JSON null bodies", async () => {
  const response = await handleUsernamePatch(usernameRequest(null), dependencies())

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "username must be a non-empty string" })
})

test("PATCH preserves allowed username domain errors", async () => {
  const cases = [
    ['Username "newname" is already taken', 409],
    ["You must set a username before changing it", 400],
    ["You have already used your one-time username change", 400],
    ["That is already your username", 400],
    ["Username must be between 3 and 20 characters", 400],
    ["Only letters and numbers allowed.", 400],
    ["Invalid username format", 400],
  ]

  for (const [message, status] of cases) {
    const response = await handleUsernamePatch(usernameRequest({ username: "newname" }), dependencies({
      changeUsername: async () => {
        throw new Error(message)
      },
    }))

    assert.equal(response.status, status)
    assert.deepEqual(await responseJson(response), { error: message })
  }
})

test("PATCH maps unique username conflicts through the injected predicate", async () => {
  const conflict = new Error("database-specific unique conflict")
  const response = await handleUsernamePatch(usernameRequest({ username: "newname" }), dependencies({
    changeUsername: async () => {
      throw conflict
    },
    isUniqueConstraintError: (err) => err === conflict,
  }))

  assert.equal(response.status, 409)
  assert.deepEqual(await responseJson(response), { error: "Username is already taken" })
})

test("PATCH returns a generic 500 for unexpected username change failures", async () => {
  const logs = []
  const response = await handleUsernamePatch(usernameRequest({ username: "newname" }), dependencies({
    changeUsername: async () => {
      throw new Error("Prisma connection string leaked")
    },
    logger: { error: (...args) => logs.push(args) },
  }))

  assert.equal(response.status, 500)
  assert.deepEqual(await responseJson(response), { error: "Failed to change username" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("Prisma connection"), true)
})

test("PATCH changes the username once", async () => {
  const response = await handleUsernamePatch(usernameRequest({ username: "NewName" }), dependencies({
    changeUsername: async (userId, username) => {
      assert.equal(userId, "user-1")
      assert.equal(username, "NewName")
      return "newname"
    },
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), { ok: true, username: "newname" })
})
