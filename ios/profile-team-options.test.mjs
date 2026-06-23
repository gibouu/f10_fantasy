import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const shared = await readFile(
  new URL("./FXRacing/Features/Profile/ProfileTeamOption.swift", import.meta.url),
  "utf8",
).catch(() => "")
const guestProfile = await readFile(
  new URL("./FXRacing/Features/Profile/GuestProfileView.swift", import.meta.url),
  "utf8",
)
const settings = await readFile(
  new URL("./FXRacing/Features/Profile/SettingsView.swift", import.meta.url),
  "utf8",
)

test("profile team options live in one shared catalogue", () => {
  assert.match(shared, /struct ProfileTeamOption:\s*Identifiable,\s*Sendable/)
  assert.match(shared, /static let all:\s*\[ProfileTeamOption\]/)

  for (const slug of [
    "ferrari",
    "mclaren",
    "red-bull",
    "mercedes",
    "aston-martin",
    "alpine",
    "williams",
    "racing-bulls",
    "haas",
    "audi",
    "cadillac",
  ]) {
    assert.match(shared, new RegExp(`slug: "${slug}"`))
  }

  assert.doesNotMatch(guestProfile, /private let teams:/)
  assert.doesNotMatch(settings, /private let allTeams:/)
  assert.match(guestProfile, /ProfileTeamOption\.all/)
  assert.match(settings, /ProfileTeamOption\.all/)
})

test("guest and settings profile views share the team chip view", () => {
  assert.match(shared, /struct ProfileTeamChip:\s*View/)
  assert.match(shared, /let team:\s*ProfileTeamOption/)
  assert.match(shared, /let isSelected:\s*Bool/)
  assert.match(shared, /let action:\s*\(\) -> Void/)

  assert.doesNotMatch(guestProfile, /private func teamChip/)
  assert.doesNotMatch(settings, /private func teamChip/)
  assert.match(guestProfile, /ProfileTeamChip\(/)
  assert.match(settings, /ProfileTeamChip\(/)
})
