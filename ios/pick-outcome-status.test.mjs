import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const profileDir = join(repoRoot, "ios", "FXRacing", "Features", "Profile")

// The API emits a different status vocabulary per slot because the slots are
// scored differently (see src/app/api/users/[userId]/route.ts):
//
//   p10    -> exact | partial | miss    graded by proximity to P10
//   winner -> correct | miss            binary
//   dnf    -> correct | miss            binary
//
// `correct` means the slot scored its cap — a full hit, not a half-success.
// Collapsing it into the same branch as `partial` told players that calling
// the race winner exactly right was only a partial result. See issue #419.

const views = ["ProfileView.swift", "FriendProfileView.swift"]

async function read(name) {
  return readFile(join(profileDir, name), "utf8")
}

for (const view of views) {
  test(`${view} treats "correct" as a full hit, not a partial one`, async () => {
    const source = await read(view)
    assert.ok(
      !/case\s+"correct",\s*"partial"/.test(source),
      `${view} must not group "correct" with "partial" — correct is full marks`
    )
    assert.ok(
      !/case\s+"partial",\s*"correct"/.test(source),
      `${view} must not group "partial" with "correct" — correct is full marks`
    )
  })

  test(`${view} pairs "correct" with "exact"`, async () => {
    const source = await read(view)
    assert.match(
      source,
      /case\s+"exact",\s*"correct"/,
      `${view} must render "correct" with the same success treatment as "exact"`
    )
  })

  test(`${view} keeps "partial" on its own`, async () => {
    const source = await read(view)
    assert.match(
      source,
      /case\s+"partial"\s*:/,
      `${view} must keep a distinct branch for "partial" — only P10 can be partial`
    )
  })
}

test('the picks ledger never labels a full hit "Partial"', async () => {
  const source = await read("ProfileView.swift")
  const label = source.match(/func outcomeLabel\([^)]*\)[^{]*\{[\s\S]*?\n {4}\}/)
  assert.ok(label, "outcomeLabel(_:) not found in ProfileView.swift")
  assert.ok(
    !/case\s+"[^"]*correct[^"]*"[^:]*:\s*"Partial"/.test(label[0]),
    'outcomeLabel must not map a "correct" status to the word "Partial"'
  )
  assert.match(
    label[0],
    /case\s+"exact",\s*"correct":\s*"Hit"/,
    'a full hit in any slot should read "Hit"'
  )
})

test("the API still emits the status vocabulary these views assume", async () => {
  const route = await readFile(
    join(repoRoot, "src", "app", "api", "users", "[userId]", "route.ts"),
    "utf8"
  )
  // winner and dnf are binary: they resolve to 'correct' or 'miss', never 'partial'.
  assert.match(route, /winner:[\s\S]*?status:[^,]*'correct'[\s\S]*?'miss'/)
  assert.match(route, /dnf:[\s\S]*?status:[^,]*'correct'[\s\S]*?'miss'/)
  // p10 is the only graded slot, so it is the only source of 'partial'.
  assert.match(route, /p10:[\s\S]*?'exact'[\s\S]*?'partial'[\s\S]*?'miss'/)
})
