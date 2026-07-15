import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckViewModel.swift", import.meta.url),
  "utf8",
)

test("RaceDeckViewModel orders both decks by scheduled start", () => {
  const upcomingBlock = source.match(
    /var upcoming:\s*\[Race\]\s*\{[\s\S]*?\n    \}/,
  )?.[0]
  const pastBlock = source.match(/var past:\s*\[Race\]\s*\{[\s\S]*?\n    \}/)?.[0]

  assert.ok(upcomingBlock, "upcoming race computed property should exist")
  assert.ok(pastBlock, "past race computed property should exist")
  assert.match(
    upcomingBlock,
    /\.filter\s*\{\s*\$0\.status\s*==\s*\.live\s*\|\|\s*\$0\.status\s*==\s*\.upcoming\s*\}/,
  )
  assert.match(upcomingBlock, /\.sorted\(by:\s*ascendingStart\)/)
  assert.match(pastBlock, /\.filter\s*\{\s*\$0\.status\s*==\s*\.completed\s*\}/)
  assert.match(pastBlock, /\.sorted\(by:\s*descendingStart\)/)
  assert.match(source, /return lhs\.scheduledStartUtc\s*<\s*rhs\.scheduledStartUtc/)
  assert.match(source, /return lhs\.scheduledStartUtc\s*>\s*rhs\.scheduledStartUtc/)
  assert.doesNotMatch(
    `${upcomingBlock}\n${pastBlock}`,
    /\.round/,
    "round-only sorting cannot order sprint and main races chronologically",
  )
})

test("cold-start and foreground lifecycle share one cached-first start", () => {
  assert.match(source, /private var initialStartTask: Task<Void, Never>\?/)
  assert.match(source, /private var hasCompletedInitialStart = false/)
  assert.match(source, /func handleForeground\(\) async \{[\s\S]*await start\(\)[\s\S]*await refresh\(policy: \.foreground\)/)
  assert.match(source, /if let initialStartTask \{[\s\S]*await initialStartTask\.value[\s\S]*return/)
  assert.match(source, /if let cached \{[\s\S]*publish\(cached\)[\s\S]*isLoading = false/)
})
