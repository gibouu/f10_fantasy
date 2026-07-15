import test from "node:test"
import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("./", import.meta.url))

async function collectRoutes(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectRoutes(path)
    if (entry.name !== "route.ts") return []
    return [relative(root, path).split(sep).join("/")]
  }))
  return nested.flat().sort()
}

test("web retirement preserves the complete API route manifest", async () => {
  assert.deepEqual(await collectRoutes(), [
    "account/route.ts",
    "auth/[...nextauth]/route.ts",
    "auth/mobile/exchange/route.ts",
    "auth/revoke-session/route.ts",
    "client-errors/route.ts",
    "cron/compute-scores/route.ts",
    "cron/ingest-results/route.ts",
    "cron/lock-picks/route.ts",
    "cron/sync-entries/route.ts",
    "cron/sync-schedule/route.ts",
    "diag/health/route.ts",
    "diag/race/[id]/route.ts",
    "friends/[id]/route.ts",
    "friends/route.ts",
    "leaderboard/route.ts",
    "picks/route.ts",
    "races/[id]/route.ts",
    "races/route.ts",
    "users/[userId]/route.ts",
    "users/me/route.ts",
    "users/suggest-usernames/route.ts",
    "users/team/route.ts",
    "users/tutorial/route.ts",
    "users/username/route.ts",
  ])
})
