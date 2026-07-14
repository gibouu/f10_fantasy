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
    /guard persistV2\(\) else \{ return \}[\s\S]*removeData\(forKey: Self\.v1Key\)/,
    "legacy keys must remain until v2 persistence reads back successfully",
  )
})

test("SyncManager records locked migration results instead of marking them synced", () => {
  const lockedSkipBlock = syncManager.match(
    /if let race = raceMap\[localPick\.raceId\], race\.isLocked \{[\s\S]*?continue\s*\}/,
  )?.[0]
  assert.ok(lockedSkipBlock, "client-side locked race branch should exist")
  assert.match(lockedSkipBlock, /markMigrationExpired\(raceId: localPick\.raceId\)/)
  assert.doesNotMatch(
    lockedSkipBlock,
    /markSynced\(raceId: localPick\.raceId\)/,
    "client-known locked races should not be marked synced",
  )

  assert.match(syncManager, /private enum UploadPickResult[\s\S]*case locked/)

  const serverLockedBlock = syncManager.match(/catch APIError\.serverError\(let code,[\s\S]*?code == 423 \{[\s\S]*?\n        \}/)?.[0]
  assert.ok(serverLockedBlock, "uploadPick should handle HTTP 423 explicitly")
  assert.match(serverLockedBlock, /return \.locked/)
  assert.doesNotMatch(serverLockedBlock, /return true/, "HTTP 423 should not be treated as upload success")

  const lockedUploadCase = syncManager.match(/case \.locked:[\s\S]*?(?=\n            case \.failed:)/)?.[0]
  assert.ok(lockedUploadCase, "migration should handle locked upload results")
  assert.match(lockedUploadCase, /markMigrationExpired\(raceId: localPick\.raceId\)/)
  assert.doesNotMatch(
    lockedUploadCase,
    /markSynced\(raceId: localPick\.raceId\)/,
    "server-locked uploads should not be marked synced",
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
