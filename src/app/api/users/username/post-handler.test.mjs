import test from "node:test"
import assert from "node:assert/strict"

import { handleUsernamePost } from "./post-handler.js"

function jsonRequest(body) {
  return new Request("http://localhost/api/users/username", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

function validFormat() {
  return { valid: true }
}

test("POST rejects valid JSON null bodies", async () => {
  const response = await handleUsernamePost(jsonRequest(null), {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    validateUsernameFormat: validFormat,
    setUsername: async () => {
      throw new Error("setUsername should not run")
    },
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: "username must be a non-empty string" })
})

test("POST rejects users that already set a username", async () => {
  let storedUsername = "oldname"

  const response = await handleUsernamePost(jsonRequest({ username: "newname" }), {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    validateUsernameFormat: validFormat,
    setUsername: async () => {
      throw new Error("Username is already set")
    },
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: "Username is already set" })
  assert.equal(storedUsername, "oldname")
})

test("POST sets an initial username", async () => {
  const response = await handleUsernamePost(jsonRequest({ username: "FirstName" }), {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    validateUsernameFormat: validFormat,
    setUsername: async (userId, username) => {
      assert.equal(userId, "user-1")
      assert.equal(username, "FirstName")
      return "firstname"
    },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, username: "firstname" })
})
