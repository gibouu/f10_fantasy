import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const TEAM_ID = "U6Z87CS4W3"

const projectYml = await readFile(new URL("./project.yml", import.meta.url), "utf8")
const pbxproj = await readFile(
  new URL("./FXRacing.xcodeproj/project.pbxproj", import.meta.url),
  "utf8",
)

test("XcodeGen manifest sets the Apple development team", () => {
  assert.match(projectYml, new RegExp(`DEVELOPMENT_TEAM:\\s+"?${TEAM_ID}"?`))
  assert.doesNotMatch(projectYml, /DEVELOPMENT_TEAM:\s*""/)
})

test("generated Xcode project signing configs use the Apple development team", () => {
  const configuredTeams = [...pbxproj.matchAll(/DEVELOPMENT_TEAM = ([^;]+);/g)].map(
    ([, team]) => team,
  )

  assert.ok(configuredTeams.length >= 2)
  assert.deepEqual(new Set(configuredTeams), new Set([TEAM_ID]))
})
