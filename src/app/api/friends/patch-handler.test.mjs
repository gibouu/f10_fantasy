import test from "node:test"
import assert from "node:assert/strict"

import { handleFriendRequestPatch } from "./[id]/patch-handler.js"

function jsonRequest(body) {
  return new Request("http://localhost/api/friends/request-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

function authedDeps(overrides = {}) {
  return {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    acceptFriendRequest: async () => {},
    rejectFriendRequest: async () => {},
    logError: () => {},
    ...overrides,
  }
}

test("PATCH returns a generic 500 for unexpected friendship failures", async () => {
  const response = await handleFriendRequestPatch(
    jsonRequest({ action: "accept" }),
    { id: "request-1" },
    authedDeps({
      acceptFriendRequest: async () => {
        throw new Error("database password leaked in raw error")
      },
    }),
  )

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Failed to update friend request" })
})

test("PATCH preserves expected friendship domain errors as 4xx", async () => {
  const response = await handleFriendRequestPatch(
    jsonRequest({ action: "reject" }),
    { id: "request-1" },
    authedDeps({
      rejectFriendRequest: async () => {
        throw new Error("You are not a party to this friend request")
      },
    }),
  )

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: "You are not a party to this friend request" })
})
