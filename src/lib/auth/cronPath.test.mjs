import test from "node:test"
import assert from "node:assert/strict"

import { isCronRoutePath } from "./cronPath.js"

test("isCronRoutePath matches the cron route family only", () => {
  assert.equal(isCronRoutePath("/api/cron"), true)
  assert.equal(isCronRoutePath("/api/cron/lock-picks"), true)
  assert.equal(isCronRoutePath("/api/cron/sync-schedule"), true)

  assert.equal(isCronRoutePath("/api/cron-status"), false)
  assert.equal(isCronRoutePath("/api/cronjobs"), false)
  assert.equal(isCronRoutePath("/api/cronicle"), false)
  assert.equal(isCronRoutePath("/api/cronish/path"), false)
})
