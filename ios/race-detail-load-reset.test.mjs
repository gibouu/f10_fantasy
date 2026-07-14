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

test("selections use stable IDs and local-first save uses the shared sync path", () => {
  for (const selectionID of [
    "selectedWinnerID",
    "selectedP10ID",
    "selectedDNFID",
  ]) {
    assert.match(source, new RegExp(`var ${selectionID}: String\\?`))
  }

  assert.match(source, /localPickStore\.save\(/)
  assert.match(source, /syncManager\.submitExplicit\(/)
  assert.match(source, /revision: record\.revision/)
  assert.doesNotMatch(source, /let api = APIClient\(\)/)

  const authenticatedSave = source.slice(
    source.indexOf("guard case .user(let currentUserID)"),
    source.indexOf("let result = await syncManager.submitExplicit"),
  )
  const deviceSaved = authenticatedSave.indexOf("submissionState = .savedOnDevice")
  const yielded = authenticatedSave.indexOf("await Task.yield()")
  const syncing = authenticatedSave.indexOf("submissionState = .syncing")
  assert.ok(deviceSaved >= 0 && deviceSaved < yielded)
  assert.ok(yielded < syncing)
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
