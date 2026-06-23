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
const rootView = await readFile(
  new URL("./FXRacing/RootView.swift", import.meta.url),
  "utf8",
)

test("LocalPickStore records expired migrations without retrying them", () => {
  assert.match(
    localPickStore,
    /enum LocalPickMigrationStatus:[\s\S]*case expired/,
    "LocalPick should persist an expired migration status",
  )
  assert.match(
    localPickStore,
    /var migrationStatus: LocalPickMigrationStatus\?/,
    "LocalPick should carry the persisted migration status",
  )

  const unsyncedBlock = localPickStore.match(/func unsyncedPicks\(\) -> \[LocalPick\] \{[\s\S]*?\n    \}/)?.[0]
  assert.ok(unsyncedBlock, "unsyncedPicks() should exist")
  assert.match(unsyncedBlock, /!\$0\.synced/)
  assert.match(
    unsyncedBlock,
    /\$0\.migrationStatus == nil/,
    "expired local picks should not be retried as pending uploads",
  )

  const expiredBlock = localPickStore.match(/func markMigrationExpired\(raceId: String\) \{[\s\S]*?\n    \}/)?.[0]
  assert.ok(expiredBlock, "LocalPickStore should expose markMigrationExpired(raceId:)")
  assert.match(expiredBlock, /migrationStatus = \.expired/)
  assert.doesNotMatch(expiredBlock, /synced = true/, "expired picks must not be marked synced")
  assert.match(
    localPickStore,
    /expiredMigrationNoticeCount/,
    "LocalPickStore should publish a notice count for post-sign-in UX",
  )
  assert.match(
    localPickStore,
    /func clearExpiredMigrationNotice\(\) \{[\s\S]*expiredMigrationNoticeCount = 0/,
    "LocalPickStore should allow the UI to acknowledge and clear expired-pick notices",
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
