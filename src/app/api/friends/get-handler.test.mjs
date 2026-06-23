import test from "node:test"
import assert from "node:assert/strict"

import { handleFriendsGet } from "./get-handler.js"

function getRequest(path = "/api/friends") {
  return new Request(`http://localhost${path}`, { method: "GET" })
}

function authedDeps(overrides = {}) {
  return {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    searchUsers: async () => {
      throw new Error("searchUsers should not run")
    },
    getFriends: async () => [{ id: "friend-1" }],
    getPendingRequests: async () => [{ id: "received-1" }],
    getSentRequests: async () => [{ id: "sent-1" }],
    ...overrides,
  }
}

test("GET rejects unauthenticated friend requests before service calls", async () => {
  const response = await handleFriendsGet(
    getRequest(),
    authedDeps({
      auth: async () => null,
      mobileAuth: async () => null,
      getFriends: async () => {
        throw new Error("getFriends should not run")
      },
      getPendingRequests: async () => {
        throw new Error("getPendingRequests should not run")
      },
      getSentRequests: async () => {
        throw new Error("getSentRequests should not run")
      },
    }),
  )

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: "Unauthorized" })
})

test("GET delegates search requests to searchUsers only", async () => {
  const calls = []
  const response = await handleFriendsGet(
    getRequest("/api/friends?search=alex"),
    authedDeps({
      searchUsers: async (query, userId) => {
        calls.push([query, userId])
        return [{ id: "user-2" }]
      },
      getFriends: async () => {
        throw new Error("getFriends should not run for search")
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [{ id: "user-2" }])
  assert.deepEqual(calls, [["alex", "user-1"]])
})

test("GET keeps legacy q search requests supported", async () => {
  const calls = []
  const response = await handleFriendsGet(
    getRequest("/api/friends?q=alex"),
    authedDeps({
      searchUsers: async (query, userId) => {
        calls.push([query, userId])
        return [{ id: "user-2" }]
      },
      getFriends: async () => {
        throw new Error("getFriends should not run for search")
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [{ id: "user-2" }])
  assert.deepEqual(calls, [["alex", "user-1"]])
})

test("GET returns friends plus received and sent pending requests", async () => {
  const calls = []
  const response = await handleFriendsGet(
    getRequest(),
    authedDeps({
      getFriends: async (userId) => {
        calls.push(["friends", userId])
        return [{ id: "friend-1" }]
      },
      getPendingRequests: async (userId) => {
        calls.push(["received", userId])
        return [{ id: "received-1" }]
      },
      getSentRequests: async (userId) => {
        calls.push(["sent", userId])
        return [{ id: "sent-1" }]
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    friends: [{ id: "friend-1" }],
    pendingReceived: [{ id: "received-1" }],
    pendingSent: [{ id: "sent-1" }],
  })
  assert.deepEqual(
    calls.sort(([a], [b]) => a.localeCompare(b)),
    [
      ["friends", "user-1"],
      ["received", "user-1"],
      ["sent", "user-1"],
    ],
  )
})
