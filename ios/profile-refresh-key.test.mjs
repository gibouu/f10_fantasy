import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Profile/ProfileView.swift", import.meta.url),
  "utf8",
)

test("ProfileView reloads own profile when display-affecting auth fields change", () => {
  assert.match(
    source,
    /\.task\(id:\s*profileRefreshKey\)\s*\{\s*await profileVm\.load\(token:\s*authManager\.accessToken\)\s*\}/,
    "profile loading should be keyed so auth field updates refresh the current profile",
  )
  assert.match(
    source,
    /private var profileRefreshKey:\s*ProfileRefreshKey\s*\{\s*ProfileRefreshKey\(user:\s*authManager\.authenticatedUser\)\s*\}/,
    "ProfileView should derive the task id from the current authenticated user",
  )
  assert.match(
    source,
    /private struct ProfileRefreshKey:\s*Equatable\s*\{[\s\S]*let userId:\s*String\?[\s\S]*let publicUsername:\s*String\?[\s\S]*let favoriteTeamSlug:\s*String\?/,
    "profile refresh key should include the fields rendered by the profile header",
  )
})
