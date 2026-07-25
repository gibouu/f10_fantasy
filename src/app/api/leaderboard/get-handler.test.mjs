import test from "node:test"
import assert from "node:assert/strict"

import { handleLeaderboardGet } from "./get-handler.js"

function request(url) {
  return {
    nextUrl: new URL(url),
  }
}

function dependencies(overrides = {}) {
  return {
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    getActiveSeason: async () => ({ id: "season-1" }),
    getGlobalLeaderboardResult: async () => ({ rows: [], userRank: null }),
    getFriendsLeaderboard: async () => [],
    getUserLeaderboardRank: async () => null,
    validateLeaderboardSort: async () => true,
    ...overrides,
  }
}

test("GET returns global rows and userRank from the combined leaderboard result", async () => {
  const globalCalls = []
  const response = await handleLeaderboardGet(
    request("http://localhost/api/leaderboard?sort=race-1&seasonId=season-1"),
    dependencies({
      getGlobalLeaderboardResult: async (seasonId, sort, limit, userId) => {
        globalCalls.push({ seasonId, sort, limit, userId })
        return {
          rows: [{ userId: "user-1", rank: sort === "race-1" ? 3 : 9 }],
          userRank: sort === "race-1" ? 3 : 9,
        }
      },
      getUserLeaderboardRank: async () => {
        throw new Error("global requests should not recompute user rank")
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(globalCalls, [
    { seasonId: "season-1", sort: "race-1", limit: 20, userId: "user-1" },
  ])
  assert.equal((await response.json()).userRank, 3)
})

test("GET keeps season as the default leaderboard sort", async () => {
  const globalCalls = []
  const response = await handleLeaderboardGet(
    request("http://localhost/api/leaderboard?seasonId=season-1"),
    dependencies({
      getGlobalLeaderboardResult: async (seasonId, sort, limit, userId) => {
        globalCalls.push({ seasonId, sort, limit, userId })
        return { rows: [], userRank: 2 }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(globalCalls, [
    { seasonId: "season-1", sort: "season", limit: 20, userId: "user-1" },
  ])
  assert.equal((await response.json()).userRank, 2)
})

test("GET allows unauthenticated global leaderboard reads", async () => {
  const globalCalls = []
  const rankCalls = []
  const response = await handleLeaderboardGet(
    request("http://localhost/api/leaderboard?scope=global&sort=season&seasonId=season-1"),
    dependencies({
      auth: async () => null,
      mobileAuth: async () => null,
      getGlobalLeaderboardResult: async (seasonId, sort, limit, userId) => {
        globalCalls.push({ seasonId, sort, limit, userId })
        return { rows: [{ userId: "user-2", rank: 1 }], userRank: null }
      },
      getUserLeaderboardRank: async (...args) => {
        rankCalls.push(args)
        return 1
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(globalCalls, [
    { seasonId: "season-1", sort: "season", limit: 20, userId: null },
  ])
  assert.deepEqual(rankCalls, [])
  assert.deepEqual(await response.json(), {
    rows: [{ userId: "user-2", rank: 1 }],
    userRank: null,
    userRow: null,
  })
})

test("GET requires authentication for friends leaderboard reads", async () => {
  const friendsCalls = []
  const response = await handleLeaderboardGet(
    request("http://localhost/api/leaderboard?scope=friends&sort=season&seasonId=season-1"),
    dependencies({
      auth: async () => null,
      mobileAuth: async () => null,
      getFriendsLeaderboard: async (...args) => {
        friendsCalls.push(args)
        return []
      },
    }),
  )

  assert.equal(response.status, 401)
  assert.deepEqual(friendsCalls, [])
  assert.deepEqual(await response.json(), { error: "Unauthorized" })
})

test("GET rejects invalid race sort values before loading leaderboard rows", async () => {
  const calls = []
  const response = await handleLeaderboardGet(
    request("http://localhost/api/leaderboard?sort=not-a-race&seasonId=season-1"),
    dependencies({
      validateLeaderboardSort: async (seasonId, sort) => {
        calls.push({ fn: "validateLeaderboardSort", seasonId, sort })
        return false
      },
      getGlobalLeaderboardResult: async () => {
        calls.push({ fn: "getGlobalLeaderboardResult" })
        return { rows: [], userRank: null }
      },
      getUserLeaderboardRank: async () => {
        calls.push({ fn: "getUserLeaderboardRank" })
        return null
      },
    }),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(calls, [
    { fn: "validateLeaderboardSort", seasonId: "season-1", sort: "not-a-race" },
  ])
  assert.deepEqual(await response.json(), { error: "Invalid race id" })
})
