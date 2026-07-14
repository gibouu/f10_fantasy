import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Races/RaceDetailViewModel.swift", import.meta.url),
  "utf8",
)
const viewSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDetailView.swift", import.meta.url),
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

test("the open detail sheet observes shared local sync transitions", () => {
  assert.match(source, /func reconcileLocalState\(/)
  assert.match(viewSource, /onChange\(of: observedGuestRecord\)/)
  assert.match(viewSource, /onChange\(of: observedAccountRecord\)/)
  assert.match(viewSource, /viewModel\.reconcileLocalState\(/)
  assert.match(
    viewSource,
    /viewModel\.selectedWinnerID\s*\?\?\s*viewModel\.serverPick\?\.winnerDriverId/,
  )
})
