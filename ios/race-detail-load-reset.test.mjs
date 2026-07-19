import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Races/RaceDetailViewModel.swift", import.meta.url),
  "utf8",
)
const deckSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
)
const pastCardSource = await readFile(
  new URL("./FXRacing/Features/Races/PastRaceCard.swift", import.meta.url),
  "utf8",
)

test("detail refresh preserves a dirty draft and generation guards every merge", () => {
  assert.match(source, /loadGeneration/)
  assert.match(source, /guard generation == loadGeneration/)
  assert.doesNotMatch(
    source,
    /selectedWinner(?:ID)? = nil[\s\S]*selectedP10(?:ID)? = nil[\s\S]*selectedDNF(?:ID)? = nil/,
  )
  assert.match(source, /\.savedOnDevice/)
  assert.match(source, /\.savedToAccount/)
})

test("detail hydration is summary-first, cached-first, and concurrent", () => {
  assert.match(source, /init\([\s\S]*summary: Race/)
  assert.match(source, /repository\.cachedDetail\(id: raceID\)/)
  assert.match(source, /withTaskGroup/)
  assert.match(source, /repository\.refreshDetail\(\s*id:\s*raceID,\s*policy:/)
  assert.match(source, /api\.request\(\.pickForRace\(raceId: raceID\), token: token\)/)
})

test("final selection commits synchronously before the revision-safe sync path", () => {
  for (const selectionID of [
    "selectedWinnerID",
    "selectedP10ID",
    "selectedDNFID",
  ]) {
    assert.match(source, new RegExp(`var ${selectionID}: String\\?`))
  }

  const commitStart = source.indexOf("func selectAndCommit(")
  const syncStart = source.indexOf("func syncCommittedPick(", commitStart)
  assert.ok(commitStart >= 0, "selectAndCommit should exist")
  assert.ok(syncStart > commitStart, "syncCommittedPick should follow the local commit")

  const commit = source.slice(commitStart, syncStart)
  assert.match(commit, /localPickStore\.save\(/)
  assert.match(commit, /localPickStore\.record\(id: record\.id\)/)
  assert.match(commit, /submissionState = \.savedOnDevice/)
  assert.match(commit, /return \.committed\(/)
  assert.doesNotMatch(commit, /\bTask\s*\{|await\s/)

  const sync = source.slice(syncStart, source.indexOf("func submit(", syncStart))
  assert.match(sync, /syncManager\.currentSessionLease\(/)
  assert.match(sync, /syncManager\.isCurrent\(/)
  assert.match(sync, /syncManager\.submitExplicit\(/)
  assert.match(sync, /revision: ticket\.revision/)
  assert.match(sync, /currentRecord\.revision == ticket\.revision/)
  assert.doesNotMatch(source, /let api = APIClient\(\)/)
})

test("private pick recovery authority has explicit captured-session outcomes", () => {
  assert.match(source, /enum PrivatePickAuthority: Equatable, Sendable/)
  for (const state of [
    "notRequired",
    "checking",
    "missing",
    "found",
    "unavailable",
    "unauthorized",
  ]) {
    assert.match(source, new RegExp(`case(?:\\s+\\w+,)*\\s*${state}|case\\s+${state}`))
  }
  assert.match(source, /private\(set\) var privatePickAuthority/)
  assert.match(source, /struct PrivatePickAuthorityCapture \{[\s\S]*?let requestToken: String\?[\s\S]*?let sessionLease: SyncManager\.SessionLease\?/)
  assert.match(source, /private var privatePickAuthorityCapture: PrivatePickAuthorityCapture\?/)
  assert.match(source, /struct LoadFlight \{[\s\S]*?let requestToken: String\?/)
  assert.match(source, /flight\.scope == scope[\s\S]*?flight\.requestToken == token/)
  assert.match(source, /privateSessionLease: SyncManager\.SessionLease\?/)
  assert.match(source, /syncManager\.isCurrent\(privateSessionLease\)/)
  assert.match(source, /hasCurrentPrivatePickAuthority\(scope: scope, token: token\)/)
  assert.match(source, /privatePickAuthority == \.missing[\s\S]*?hasCurrentPrivatePickAuthority\(scope: scope, token: token\)/)
})

test("loading and saving expose explicit non-blocking state", () => {
  assert.match(source, /enum PickSubmissionState: Equatable/)
  for (const state of [
    "idle",
    "savingLocally",
    "savedOnDevice",
    "syncing",
    "savedToAccount",
    "conflict",
    "expired",
  ]) {
    assert.match(source, new RegExp(`case(?:\\s+\\w+,)*\\s*${state}|case\\s+${state}`))
  }
  assert.match(source, /func loadIfNeeded\(/)
  assert.match(source, /func refresh\(/)
})

test("the selected race observes local sync and renders server-owned scoring", () => {
  assert.match(source, /func reconcileLocalState\(/)
  assert.match(deckSource, /onChange\(of: observedGuestRecord\)/)
  assert.match(deckSource, /onChange\(of: observedAccountRecord\)/)
  assert.match(deckSource, /scopedSelectedDetail\?\.reconcileLocalState\(/)
  assert.match(pastCardSource, /serverPick\?\.scoreBreakdown/)
  assert.match(pastCardSource, /breakdown\?\.dnfBonus/)
  assert.doesNotMatch(pastCardSource, /results\.first[\s\S]*status\s*==\s*\.dnf/)
})

test("past races separate retained device drafts from official scoring", () => {
  assert.match(source, /var unsubmittedDeviceDraft:\s*PickSelection\?/)
  assert.match(pastCardSource, /Device draft — not submitted/)

  const draftSection = pastCardSource.slice(
    pastCardSource.indexOf("private func deviceDraft"),
    pastCardSource.indexOf("private var loadingScore"),
  )
  assert.match(draftSection, /unsubmittedDeviceDraft/)
  assert.doesNotMatch(draftSection, /scoreBreakdown|points:/)
})

test("race-detail models are isolated by private session scope", () => {
  assert.match(deckSource, /privateScopeID/)
  assert.match(deckSource, /selectedDetailScopeID/)
  assert.match(deckSource, /viewModel\.detailViewModel\(\s*for:\s*race,\s*privateScopeID:/)
  assert.match(deckSource, /viewModel\.existingDetailViewModel\(\s*for:\s*race\.id,\s*privateScopeID:/)
})

test("session-scope observation cannot clear the replacement detail task", () => {
  const start = deckSource.indexOf(".onChange(of: privateScopeID)")
  const end = deckSource.indexOf(".onChange(of: viewModel.transitionedRaceID)", start)
  const scopeChange = deckSource.slice(start, end)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(scopeChange, /isShowingPicker = false/)
  assert.doesNotMatch(scopeChange, /selectedDetail\?\.cancelLoad\(\)/)
  assert.doesNotMatch(scopeChange, /selectedDetail = nil/)
  assert.doesNotMatch(scopeChange, /viewModel\.setPrivateScope/)
})

test("foreground refresh replaces detail hydration without a cancellation gap", () => {
  const start = deckSource.indexOf("private func refreshSelectedDetail()")
  const end = deckSource.indexOf("private func refreshSelectedDetailNow()", start)
  const refresh = deckSource.slice(start, end)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(refresh, /await detail\.refresh\(/)
  assert.doesNotMatch(refresh, /detail\.cancelLoad\(\)/)
})

test("swiping away cancels obsolete selected-detail hydration", () => {
  assert.match(source, /func cancelLoad\(\)/)
  assert.match(deckSource, /currentDetail\.cancelLoad\(\)/)
  assert.match(deckSource, /selectedDetail\?\.cancelLoad\(\)/)
  assert.match(deckSource, /detail\.race\.id == selectedRaceID/)
})
