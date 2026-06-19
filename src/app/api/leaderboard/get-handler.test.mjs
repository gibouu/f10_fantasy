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
    getGlobalLeaderboard: async () => [],
    getFriendsLeaderboard: async () => [],
    getUserLeaderboardRank: async () => null,
    ...overrides,
  }
}

test("GET uses the requested race sort when computing userRank", async () => {
  const rankCalls = []
  const response = await handleLeaderboardGet(
    request("http://localhost/api/leaderboard?sort=race-1&seasonId=season-1"),
    dependencies({
      getGlobalLeaderboard: async (_seasonId, sort) => [
        { userId: "user-1", rank: sort === "race-1" ? 3 : 9 },
      ],
      getUserLeaderboardRank: async (userId, seasonId, sort) => {
        rankCalls.push({ userId, seasonId, sort })
        return sort === "race-1" ? 3 : 9
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(rankCalls, [{ userId: "user-1", seasonId: "season-1", sort: "race-1" }])
  assert.equal((await response.json()).userRank, 3)
})

test("GET keeps season as the default userRank sort", async () => {
  const rankCalls = []
  const response = await handleLeaderboardGet(
    request("http://localhost/api/leaderboard?seasonId=season-1"),
    dependencies({
      getUserLeaderboardRank: async (userId, seasonId, sort) => {
        rankCalls.push({ userId, seasonId, sort })
        return 2
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(rankCalls, [{ userId: "user-1", seasonId: "season-1", sort: "season" }])
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
      getGlobalLeaderboard: async (seasonId, sort, limit) => {
        globalCalls.push({ seasonId, sort, limit })
        return [{ userId: "user-2", rank: 1 }]
      },
      getUserLeaderboardRank: async (...args) => {
        rankCalls.push(args)
        return 1
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(globalCalls, [{ seasonId: "season-1", sort: "season", limit: 20 }])
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
