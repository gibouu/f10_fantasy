import test from "node:test"
import assert from "node:assert/strict"

import { handleFriendRequestPost } from "./post-handler.js"

function jsonRequest(body) {
  return new Request("http://localhost/api/friends", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

function rawRequest(body) {
  return new Request("http://localhost/api/friends", {
    method: "POST",
    body,
  })
}

function authedDeps(overrides = {}) {
  return {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    sendFriendRequest: async () => ({ id: "request-1" }),
    logError: () => {},
    ...overrides,
  }
}

test("POST maps nonexistent friend targets to a sanitized 404", async () => {
  const response = await handleFriendRequestPost(
    jsonRequest({ addresseeId: "missing-user" }),
    authedDeps({
      sendFriendRequest: async () => {
        throw new Error("Friend request recipient not found")
      },
    }),
  )

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: "Friend request recipient not found" })
})

test("POST rejects non-object friend request bodies before service calls", async () => {
  const response = await handleFriendRequestPost(
    jsonRequest(null),
    authedDeps({
      sendFriendRequest: async () => {
        throw new Error("sendFriendRequest should not run")
      },
    }),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: "addresseeId is required" })
})

test("POST rejects malformed friend request JSON before service calls", async () => {
  const response = await handleFriendRequestPost(
    rawRequest("{"),
    authedDeps({
      sendFriendRequest: async () => {
        throw new Error("sendFriendRequest should not run")
      },
    }),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: "Invalid JSON body" })
})

test("POST returns a generic 500 for unexpected friendship failures", async () => {
  const logs = []
  const response = await handleFriendRequestPost(
    jsonRequest({ addresseeId: "missing-user" }),
    authedDeps({
      sendFriendRequest: async () => {
        throw new Error("Prisma foreign key details leaked")
      },
      logError: (...args) => logs.push(args),
    }),
  )

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Failed to send friend request" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("Prisma foreign key"), true)
})
