import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./leaderboard.service.ts", import.meta.url), "utf8")

function serviceBlock(startText, endText) {
  const start = source.indexOf(startText)
  const end = source.indexOf(endText, start)

  assert.notEqual(start, -1, `${startText} source block should exist`)
  assert.notEqual(end, -1, `${endText} source block should follow ${startText}`)

  return source.slice(start, end)
}

test("race-specific global leaderboards seed users from scored pick sets for that race", () => {
  const userIdBlock = serviceBlock(
    "async function getScoredUserIdsForSort",
    "async function getRankedGlobalLeaderboard",
  )
  const globalBlock = serviceBlock(
    "async function getRankedGlobalLeaderboard",
    "/**\n * Get the global leaderboard",
  )

  assert.match(
    source,
    /function raceWhereForSort\(seasonId: string, sort: string\) \{\s*return sort === 'season'\s*\?\s*\{ seasonId, status: 'COMPLETED' as const \}\s*:\s*\{ seasonId, status: 'COMPLETED' as const, id: sort \s*\}/,
  )
  assert.match(userIdBlock, /race: raceWhereForSort\(seasonId, sort\)/)
  assert.match(userIdBlock, /scoreBreakdown: \{ isNot: null \}/)
  assert.match(userIdBlock, /distinct: \['userId'\]/)
  assert.match(globalBlock, /const userIds = await getScoredUserIdsForSort\(seasonId, sort\)/)
  assert.doesNotMatch(globalBlock, /race:\s*\{\s*seasonId\s*\}/)
})

test("race-specific friends leaderboards keep only friends scored for that race", () => {
  const friendsBlock = serviceBlock(
    "export async function getFriendsLeaderboard",
    "export async function validateLeaderboardSort",
  )

  assert.match(
    friendsBlock,
    /const leaderboardUserIds =\s*sort === 'season' \? allIds : await getScoredUserIdsForSort\(seasonId, sort, allIds\)/,
  )
  assert.match(friendsBlock, /const rows = await aggregateScores\(leaderboardUserIds, seasonId, sort\)/)
})

test("leaderboard sort validation accepts season or a race in the selected season", () => {
  const validateBlock = serviceBlock(
    "export async function validateLeaderboardSort",
    "/**\n * Get a single user's rank",
  )

  assert.match(validateBlock, /if \(sort === 'season'\) return true/)
  assert.match(validateBlock, /db\.race\.findFirst\(\{\s*where: \{ id: sort, seasonId \}/)
  assert.match(validateBlock, /return Boolean\(race\)/)
})

test("global leaderboard result derives rows and userRank from one ranked aggregation", () => {
  const resultBlock = serviceBlock(
    "export async function getGlobalLeaderboardResult",
    "/**\n * Get the leaderboard for a user",
  )

  assert.match(resultBlock, /const rankedRows = await getRankedGlobalLeaderboard\(seasonId, sort\)/)
  assert.match(resultBlock, /rankedRows\.find\(\(row\) => row\.userId === userId\)\?\.rank/)
  assert.match(resultBlock, /rows: rankedRows\.slice\(0, limit\)/)
  assert.doesNotMatch(resultBlock, /getUserLeaderboardRank/)
})
