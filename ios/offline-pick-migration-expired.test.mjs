import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const syncManager = await readFile(
  new URL("./FXRacing/Core/Sync/SyncManager.swift", import.meta.url),
  "utf8",
)
const localPickStore = await readFile(
  new URL("./FXRacing/Core/Storage/LocalPickStore.swift", import.meta.url),
  "utf8",
)
const localPickRecord = await readFile(
  new URL("./FXRacing/Core/Storage/LocalPickRecord.swift", import.meta.url),
  "utf8",
)
const rootView = await readFile(
  new URL("./FXRacing/RootView.swift", import.meta.url),
  "utf8",
)

test("local pick v2 records carry owner, revision, and persistent sync state", () => {
  assert.match(
    localPickRecord,
    /enum PickOwnerScope:[\s\S]*case guest[\s\S]*case user\(String\)[\s\S]*case legacyAmbiguous/,
  )
  assert.match(
    localPickRecord,
    /struct LocalPickRecordID:[\s\S]*let owner: PickOwnerScope[\s\S]*let raceID: String/,
  )
  assert.match(localPickRecord, /let revision: UInt64/)
  assert.match(
    localPickRecord,
    /case syncing\(revision: UInt64, mode: PickSyncMode\)/,
  )
  assert.match(localPickRecord, /case conflict\(PickConflictReason\)/)
  assert.match(localPickRecord, /case expired/)
})

test("LocalPickStore filters queues by owner and checks every transition revision", () => {
  const queuedBlock = localPickStore.match(
    /func queuedRecords\(currentUserID:[\s\S]*?\n    \}/,
  )?.[0]
  assert.ok(queuedBlock, "owner-filtered queuedRecords(currentUserID:) should exist")
  assert.match(queuedBlock, /syncState == \.queued/)
  assert.match(queuedBlock, /isEligibleOwner/)

  const ownerBlock = localPickStore.match(
    /func isEligibleOwner[\s\S]*?\n    \}/,
  )?.[0]
  assert.ok(ownerBlock, "queue eligibility should be centralized")
  assert.match(ownerBlock, /case \.guest/)
  assert.match(ownerBlock, /case \.user\(let userID\)/)
  assert.match(
    ownerBlock,
    /case \.legacyAmbiguous:[\s\S]*return false/,
    "ambiguous legacy records must never enter automatic retry",
  )

  const transitionBlock = localPickStore.match(
    /func transition\([\s\S]*?\n    \}/,
  )?.[0]
  assert.ok(transitionBlock, "revision-checked transition should exist")
  assert.match(transitionBlock, /record\.revision == revision/)
  assert.match(transitionBlock, /records\[id\] = record/)
})

test("legacy v1 picks become terminal legacy records before old keys are deleted", () => {
  assert.match(
    localPickStore,
    /legacy\.migrationStatus == \.expired[\s\S]*\? \.expired/,
    "expired legacy migrations should remain terminal",
  )
  assert.match(
    localPickStore,
    /\.conflict\(\.legacyNeedsReview\)/,
    "non-expired ownerless records should require explicit review",
  )
  assert.match(
    localPickStore,
    /if let v2Data[\s\S]*isValid\(envelope\)[\s\S]*removeData\(forKey: Self\.v1Key\)/,
    "a later valid v2 load should retire the legacy copy",
  )
  const migrationBlock = localPickStore.match(
    /private func migrateLegacyIfPresent\(\) \{[\s\S]*?\n    \}\n\n    private func isValid/,
  )?.[0]
  assert.ok(migrationBlock, "legacy migration should remain explicit")
  assert.match(migrationBlock, /_ = persistV2\(\)/)
  assert.doesNotMatch(
    migrationBlock,
    /removeData\(forKey:/,
    "the process that writes v2 must retain v1 until a later launch reads v2",
  )
})

test("SyncManager serializes owner-scoped revisions through one worker", () => {
  assert.match(
    syncManager,
    /func submitExplicit\([\s\S]*?currentUserID: String[\s\S]*?case \.user\(let ownerID\) = id\.owner,[\s\S]*?ownerID == currentUserID/,
  )
  assert.match(
    syncManager,
    /private var workers: \[LocalPickRecordID: Worker\]/,
    "workers must be keyed by composite owner/race ID",
  )
  assert.match(
    syncManager,
    /latestExplicitRevision: \[LocalPickRecordID: UInt64\]/,
  )
  assert.match(
    syncManager,
    /if !isExplicit \{[\s\S]*?\.pickForRace\(raceId: id\.raceID\)/,
    "only automatic work should preflight the server pick",
  )
  assert.match(syncManager, /\.submitPick\([\s\S]*?raceId: id\.raceID/)
  assert.match(syncManager, /\? \.serverWins[\s\S]*: \.accountPickFound/)
})

test("SyncManager keeps locked and unauthorized outcomes revision safe", () => {
  assert.match(
    syncManager,
    /clock\.now\(\) >= race\.lockCutoffUtc[\s\S]*?terminalResult\([\s\S]*?\.expired/,
    "a known locked race should expire without a request",
  )
  assert.match(
    syncManager,
    /catch APIError\.serverError\(let code, _\) where code == 423[\s\S]*?terminalResult\([\s\S]*?\.expired/,
    "POST 423 must expire the captured revision",
  )
  assert.match(
    syncManager,
    /catch APIError\.unauthorized[\s\S]*?queueCapturedRevision\([\s\S]*?return \.unauthorized/,
  )
  assert.match(
    syncManager,
    /localPickStore\.transition\([\s\S]*?revision: revision/,
  )
})

test("RootView surfaces a post-sign-in notice for expired offline picks", () => {
  assert.match(rootView, /@Environment\(LocalPickStore\.self\)/)
  assert.match(rootView, /@State private var isShowingExpiredPickAlert = false/)
  assert.match(rootView, /@State private var expiredPickAlertCount = 0/)
  assert.match(
    rootView,
    /\.onChange\(of: localPickStore\.expiredMigrationNoticeCount\)/,
    "RootView should react when migration records newly expired picks",
  )
  assert.match(rootView, /\.alert\(/)
  assert.match(rootView, /localPickStore\.clearExpiredMigrationNotice\(\)/)
  assert.match(rootView, /Offline pick/)
  assert.match(rootView, /race locked/)
})
