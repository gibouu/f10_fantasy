import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const pages = [
  ["races page", new URL("./races/page.tsx", import.meta.url)],
  ["leaderboard page", new URL("./leaderboard/page.tsx", import.meta.url)],
]

test("DB-backed main pages opt out of build-time prerendering", async () => {
  for (const [name, url] of pages) {
    const source = await readFile(url, "utf8")
    assert.match(
      source,
      /export const dynamic = ["']force-dynamic["']/,
      `${name} should not query Prisma during static generation`,
    )
  }
})
