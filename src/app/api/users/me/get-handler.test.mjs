import test from "node:test"
import assert from "node:assert/strict"

import { handleUsersMeGet } from "./get-handler.js"

function request() {
  return new Request("http://localhost/api/users/me")
}

function dependencies(overrides = {}) {
  return {
    auth: async () => null,
    mobileAuth: async () => null,
    db: {
      user: {
        findUnique: async () => null,
      },
    },
    ...overrides,
  }
}

function user(overrides = {}) {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    image: "https://example.com/avatar.png",
    publicUsername: "testuser",
    usernameSet: true,
    usernameChangeUsed: false,
    favoriteTeamSlug: "ferrari",
    tutorialDismissedAt: null,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    ...overrides,
  }
}

test("GET /api/users/me returns 401 without cookie or bearer auth", async () => {
  const calls = []
  const response = await handleUsersMeGet(
    request(),
    dependencies({
      db: {
        user: {
          findUnique: async () => {
            calls.push("findUnique")
            return null
          },
        },
      },
    }),
  )

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: "Unauthorized" })
  assert.deepEqual(calls, [])
})

test("GET /api/users/me falls back to bearer auth and returns 404 for a missing user", async () => {
  const findCalls = []
  const response = await handleUsersMeGet(
    request(),
    dependencies({
      mobileAuth: async () => ({ user: { id: "mobile-user" } }),
      db: {
        user: {
          findUnique: async (query) => {
            findCalls.push(query)
            return null
          },
        },
      },
    }),
  )

  assert.equal(response.status, 404)
  assert.equal(findCalls[0].where.id, "mobile-user")
  assert.deepEqual(await response.json(), { error: "User not found" })
})

test("GET /api/users/me serializes nullable and populated profile dates", async () => {
  const responseWithNullTutorial = await handleUsersMeGet(
    request(),
    dependencies({
      auth: async () => ({ user: { id: "user-1" } }),
      mobileAuth: async () => {
        throw new Error("mobileAuth should not run when cookie auth succeeds")
      },
      db: {
        user: {
          findUnique: async () => user(),
        },
      },
    }),
  )

  assert.equal(responseWithNullTutorial.status, 200)
  assert.deepEqual(await responseWithNullTutorial.json(), {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    avatarUrl: "https://example.com/avatar.png",
    publicUsername: "testuser",
    usernameSet: true,
    usernameChangeUsed: false,
    favoriteTeamSlug: "ferrari",
    tutorialDismissedAt: null,
    createdAt: "2026-06-01T12:00:00.000Z",
  })

  const responseWithTutorial = await handleUsersMeGet(
    request(),
    dependencies({
      auth: async () => ({ user: { id: "user-1" } }),
      db: {
        user: {
          findUnique: async () =>
            user({ tutorialDismissedAt: new Date("2026-06-02T09:30:00.000Z") }),
        },
      },
    }),
  )

  assert.equal(responseWithTutorial.status, 200)
  assert.equal(
    (await responseWithTutorial.json()).tutorialDismissedAt,
    "2026-06-02T09:30:00.000Z",
  )
})
