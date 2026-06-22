import test from "node:test"
import assert from "node:assert/strict"

import { authedDeps, jsonRequest, responseJson } from "../../test-utils.mjs"
import { handleUsernamePost } from "./post-handler.js"

function validFormat() {
  return { valid: true }
}

function usernameRequest(body) {
  return jsonRequest("http://localhost/api/users/username", body)
}

function dependencies(overrides = {}) {
  return {
    ...authedDeps("user-1"),
    validateUsernameFormat: validFormat,
    ...overrides,
  }
}

test("POST rejects valid JSON null bodies", async () => {
  const response = await handleUsernamePost(usernameRequest(null), dependencies({
    setUsername: async () => {
      throw new Error("setUsername should not run")
    },
  }))

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "username must be a non-empty string" })
})

test("POST rejects users that already set a username", async () => {
  let storedUsername = "oldname"

  const response = await handleUsernamePost(usernameRequest({ username: "newname" }), dependencies({
    setUsername: async () => {
      throw new Error("Username is already set")
    },
  }))

  assert.equal(response.status, 400)
  assert.deepEqual(await responseJson(response), { error: "Username is already set" })
  assert.equal(storedUsername, "oldname")
})

test("POST returns a generic 500 for unexpected username persistence failures", async () => {
  const logs = []
  const response = await handleUsernamePost(usernameRequest({ username: "newname" }), dependencies({
    setUsername: async () => {
      throw new Error("Prisma connection string leaked")
    },
    logger: { error: (...args) => logs.push(args) },
  }))

  assert.equal(response.status, 500)
  assert.deepEqual(await responseJson(response), { error: "Failed to set username" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("Prisma connection"), true)
})

test("POST sets an initial username", async () => {
  const response = await handleUsernamePost(usernameRequest({ username: "FirstName" }), dependencies({
    setUsername: async (userId, username) => {
      assert.equal(userId, "user-1")
      assert.equal(username, "FirstName")
      return "firstname"
    },
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), { ok: true, username: "firstname" })
})
