import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./pick.service.ts", import.meta.url), "utf8")
const createOrUpdatePickStart = source.indexOf("export async function createOrUpdatePick")
const getPickForRaceStart = source.indexOf("export async function getPickForRace")
const createOrUpdatePickBody =
  createOrUpdatePickStart >= 0 && getPickForRaceStart > createOrUpdatePickStart
    ? source.slice(createOrUpdatePickStart, getPickForRaceStart)
    : null

assert.ok(createOrUpdatePickBody, "expected to find createOrUpdatePick body")

test("createOrUpdatePick rejects cancelled races before validating entrants or writing", () => {
  const raceStatusGuard = createOrUpdatePickBody.indexOf("race.status === 'CANCELLED'")
  const entrantsLookup = createOrUpdatePickBody.indexOf("tx.raceEntry.findMany")
  const updateWrite = createOrUpdatePickBody.indexOf("tx.pickSet.updateMany")
  const createWrite = createOrUpdatePickBody.indexOf("tx.pickSet.create")

  assert.match(createOrUpdatePickBody, /const race = await lockRaceForPickWrite\(tx, validated\.raceId\)/)
  assert.notEqual(raceStatusGuard, -1)
  assert.ok(raceStatusGuard < entrantsLookup)
  assert.ok(raceStatusGuard < updateWrite)
  assert.ok(raceStatusGuard < createWrite)
  assert.match(
    source,
    /function cancelledRacePickMessage\(raceId: string\): string \{\s*return `Race \$\{raceId\} is cancelled/,
  )
  assert.match(
    createOrUpdatePickBody,
    /throw new Error\(cancelledRacePickMessage\(validated\.raceId\)\)/,
  )
})

test("createOrUpdatePick reasserts cancelled race guards for update and create writes", () => {
  assert.match(
    source,
    /async function lockRaceForPickWrite[\s\S]*?\$queryRaw[\s\S]*?SELECT[\s\S]*?FROM "Race"[\s\S]*?WHERE "id" = \$\{raceId\}[\s\S]*?FOR UPDATE/,
  )
  assert.match(
    createOrUpdatePickBody,
    /race:\s*\{[\s\S]*?lockCutoffUtc:\s*\{\s*gt:\s*new Date\(\)\s*\}[\s\S]*?status:\s*\{\s*not:\s*['"]CANCELLED['"]/,
  )

  assert.doesNotMatch(
    createOrUpdatePickBody,
    /const fresh = await tx\.race\.findUnique/,
  )
  assert.doesNotMatch(createOrUpdatePickBody, /createPickSetIfRaceWritable/)
  assert.match(createOrUpdatePickBody, /if \(race\.status === ['"]CANCELLED['"]\)[\s\S]*?tx\.pickSet\.create/)
})

test("createOrUpdatePick exposes and validates a base version for optimistic concurrency", () => {
  assert.match(source, /export function pickVersion\(updatedAt: Date\): string \{\s*return updatedAt\.toISOString\(\)/)
  assert.match(
    source,
    /baseVersion:\s*z\.string\(\)\.min\(1\)\.optional\(\)/,
  )
  assert.match(source, /export class PickConflictError extends Error/)
  assert.match(source, /this\.currentPick = currentPick/)
  assert.match(createOrUpdatePickBody, /const baseUpdatedAt = parseBasePickVersion\(validated\.baseVersion\)/)
})

test("createOrUpdatePick compares base version inside the pick transaction before updating", () => {
  const transactionStart = createOrUpdatePickBody.indexOf("return db.$transaction")
  const existingLookup = createOrUpdatePickBody.indexOf("const existingPickSet = await tx.pickSet.findUnique")
  const conflictThrow = createOrUpdatePickBody.indexOf("throw new PickConflictError(mapPickSetToData(existingPickSet))")
  const updateWrite = createOrUpdatePickBody.indexOf("tx.pickSet.updateMany")

  assert.ok(transactionStart >= 0)
  assert.ok(existingLookup > transactionStart)
  assert.ok(conflictThrow > existingLookup)
  assert.ok(conflictThrow < updateWrite)
  assert.match(
    createOrUpdatePickBody,
    /existingPickSet\.updatedAt\.getTime\(\) !== baseUpdatedAt\.getTime\(\)/,
  )
})

test("createOrUpdatePick keeps simultaneous edits guarded by the submitted version", () => {
  assert.match(
    createOrUpdatePickBody,
    /\.\.\.\(baseUpdatedAt \? \{ updatedAt: baseUpdatedAt \} : \{\}\)/,
  )
  assert.match(
    createOrUpdatePickBody,
    /only the request whose base version still matches[\s\S]*?lockedAt IS NULL succeeds/,
  )
})
