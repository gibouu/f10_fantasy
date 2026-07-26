import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Rankings/LeaderboardView.swift", import.meta.url),
  "utf8",
)
const modelSource = await readFile(
  new URL("./FXRacing/Features/Rankings/LeaderboardViewModel.swift", import.meta.url),
  "utf8",
)
const rootSource = await readFile(
  new URL("./FXRacing/RootView.swift", import.meta.url),
  "utf8",
)
const shellSource = await readFile(
  new URL("./FXRacing/Features/Home/MainShellView.swift", import.meta.url),
  "utf8",
)
const deckSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
)
const upcomingCardSource = await readFile(
  new URL("./FXRacing/Features/Races/UpcomingRaceCard.swift", import.meta.url),
  "utf8",
)
const scheduleSheetSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceScheduleSheet.swift", import.meta.url),
  "utf8",
)

test("LeaderboardView loads global rankings for signed-out users", () => {
  const loadBlock = source.match(/private func loadIfAllowed\(\) async \{[\s\S]*?\n    \}/)?.[0]

  assert.ok(loadBlock, "loadIfAllowed should exist")
  assert.match(
    loadBlock,
    /guard vm\.scope == \.global \|\| authManager\.isAuthenticated else \{ return \}/,
    "global scope should be allowed without authentication",
  )
  assert.doesNotMatch(
    loadBlock,
    /guard authManager\.isAuthenticated else \{ return \}/,
    "a blanket auth guard would make global rankings unreachable for guests",
  )
  assert.match(loadBlock, /await vm\.load\(token: authManager\.accessToken\)/)
})

test("LeaderboardView only gates Friends ranking UI behind sign-in", () => {
  assert.match(
    source,
    /case \.unauthenticated:[\s\S]*signInSection[\s\S]*Text\("Sign in to view friends"\)/,
    "the signed-out empty state should only apply to the Friends scope",
  )
  assert.match(
    source,
    /if vm\.scope == \.friends \{[\s\S]*case \.unauthenticated:[\s\S]*signInSection[\s\S]*\} else \{[\s\S]*leaderboardSections/,
    "the account switch should only gate the Friends scope",
  )
  assert.match(
    source,
    /if vm\.scope == \.friends[\s\S]*showFriendSearch/,
    "friend search actions should remain scoped to Friends",
  )
})

test("Friends distinguishes account checking and account restoration failures", () => {
  assert.match(source, /case \.unknown:[\s\S]*Checking your account/)
  assert.match(source, /case \.accountUnavailable:[\s\S]*Account unavailable/)
  assert.match(source, /accessibilityIdentifier\("account-retry"\)/)
  assert.match(source, /\.onChange\(of: authManager\.state\)/)
  assert.match(source, /case \.authenticated:[\s\S]*Task \{ await loadIfAllowed\(\) \}/)
  assert.match(source, /case \.unknown, \.unauthenticated, \.accountUnavailable:[\s\S]*vm\.clearBlockedFriendsContent\(\)/)
  assert.match(modelSource, /func clearBlockedFriendsContent\(\)[\s\S]*rows = \[\]/)
})

test("shell owns one injected leaderboard model while RootView always renders the shell", () => {
  assert.match(source, /@Bindable var vm: LeaderboardViewModel/)
  assert.match(source, /init\(viewModel: LeaderboardViewModel\)/)
  assert.match(modelSource, /private let client: any APIRequesting/)
  assert.match(modelSource, /init\(client: any APIRequesting = APIClient\(\)\)/)
  assert.match(rootSource, /MainShellView\(/)
  assert.doesNotMatch(rootSource, /case \.unknown:[\s\S]*Color\(uiColor: \.systemBackground\)/)
  assert.doesNotMatch(rootSource, /TabView\s*\{/)
})

test("persistent shell owns live polling and the deck remains Dynamic Type safe", () => {
  assert.doesNotMatch(shellSource, /\.task\(id: raceDeckViewModel\.hasLiveRace\)/)
  assert.match(shellSource, /while !Task\.isCancelled[\s\S]*seconds\(60\)/)
  assert.match(shellSource, /await raceDeckViewModel\.pollLiveRaces\(\)/)
  assert.match(
    shellSource,
    /case \.rankings:\s*raceDeckViewModel\.setActiveSection\(nil\)/,
    "Rankings should explicitly clear hidden race-deck demand",
  )
  assert.doesNotMatch(deckSource, /pollLiveRaces/)
  assert.match(
    deckSource,
    /\.onChange\(of: viewModel\.liveDetailRefreshRevision\)[\s\S]*refreshSelectedDetail\(\)/,
  )
  assert.match(deckSource, /itemAccessibilityLabel: \{ \$0\.name \}/)
  assert.match(deckSource, /\.frame\(minHeight:/)
  assert.doesNotMatch(
    deckSource,
    /CenteredRacePager[\s\S]{0,500}\.frame\(height:/,
    "The pager may set a minimum but must remain free to grow for Dynamic Type",
  )
})

test("upcoming card geometry uses deterministic metrics instead of content-driven height", () => {
  assert.match(upcomingCardSource, /@Environment\(\\\.dynamicTypeSize\)/)
  assert.match(
    upcomingCardSource,
    /UpcomingCardLayoutMetrics\.cardHeight\(\s*for:\s*dynamicTypeSize/,
  )
  assert.match(
    upcomingCardSource,
    /\.frame\(maxWidth:\s*\.infinity,\s*minHeight:\s*cardHeight,\s*alignment:\s*\.topLeading\)/,
  )
  assert.match(
    upcomingCardSource,
    /maxHeight:\s*dynamicTypeSize\.isAccessibilitySize \? nil : cardHeight/,
  )
  assert.doesNotMatch(upcomingCardSource, /\.frame\(maxWidth:\s*\.infinity,\s*minHeight:\s*412/)
})

test("Schedule sheet uses an opaque centered presentation", () => {
  assert.match(scheduleSheetSource, /\.presentationDetents\(\[\.medium, \.large\]\)/)
  assert.match(scheduleSheetSource, /\.presentationDragIndicator\(\.visible\)/)
  assert.match(scheduleSheetSource, /\.presentationBackground\(Color\(uiColor:\s*\.systemBackground\)\)/)
  assert.match(scheduleSheetSource, /\.frame\(maxWidth:\s*430,\s*alignment:\s*\.center\)/)
  assert.match(scheduleSheetSource, /Text\("Schedule"\)[\s\S]*?\.frame\(maxWidth:\s*\.infinity,\s*alignment:\s*\.center\)/)
  assert.doesNotMatch(scheduleSheetSource, /\.presentationBackground\(\.ultraThinMaterial\)/)
})

test("ranking rows open player profiles in a dismissible native sheet", () => {
  assert.match(source, /@State private var selectedPlayer:/)
  assert.match(
    source,
    /\.sheet\(item: \$selectedPlayer\)[\s\S]*FriendProfileView\(userId: player\.id\)/,
  )
  assert.match(source, /\.presentationDetents\(\[\.medium, \.large\]\)/)
  assert.match(source, /\.presentationDragIndicator\(\.visible\)/)
  assert.match(source, /accessibilityIdentifier\("ranking-row-\\\(row\.userId\)"\)/)
  assert.doesNotMatch(source, /NavigationLink/)
  assert.doesNotMatch(source, /\.navigationDestination/)
})
