import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./cleanup-orphaned-races.ts", import.meta.url), "utf8")
const sprintFetchIndex = source.indexOf("const sprintSessions = await fetchOpenF1<OpenF1Session>")
const passOneIndex = source.indexOf("// ─── Pass 1: orphan reconciliation")
const sprintBranchIndex = source.indexOf("} else if (r.type === 'SPRINT') {")
const sprintOrphanReasonIndex = source.indexOf("OpenF1 has \"${matched")

assert.notEqual(sprintFetchIndex, -1, "expected sprint session fetch")
assert.notEqual(passOneIndex, -1, "expected Pass 1 section")
assert.notEqual(sprintBranchIndex, -1, "expected sprint orphan branch")
assert.notEqual(sprintOrphanReasonIndex, -1, "expected sprint orphan push")

test("sprint orphan cleanup is skipped when OpenF1 sprint sessions look partial", () => {
  const beforePassOne = source.slice(sprintFetchIndex, passOneIndex)
  assert.match(beforePassOne, /const canReconcileSprints = sprintSessions\.length > 0/)
  assert.match(beforePassOne, /sprint orphan reconciliation disabled/)

  const sprintBranch = source.slice(sprintBranchIndex, sprintOrphanReasonIndex)
  assert.match(sprintBranch, /if \(!canReconcileSprints\) \{\s*continue\s*\}/)
})
