import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const TEAM_ID = "U6Z87CS4W3"
const MARKETING_VERSION = "1.8.1"
const BUILD_NUMBER = "46"

const projectYml = await readFile(new URL("./project.yml", import.meta.url), "utf8")
const pbxproj = await readFile(
  new URL("./FXRacing.xcodeproj/project.pbxproj", import.meta.url),
  "utf8",
)

test("XcodeGen manifest sets the Apple development team", () => {
  assert.match(projectYml, new RegExp(`DEVELOPMENT_TEAM:\\s+"?${TEAM_ID}"?`))
  assert.doesNotMatch(projectYml, /DEVELOPMENT_TEAM:\s*""/)
})

test("XcodeGen manifest pins the release version and build number", () => {
  assert.match(projectYml, new RegExp(`MARKETING_VERSION:\\s+"${MARKETING_VERSION}"`))
  assert.match(projectYml, new RegExp(`CURRENT_PROJECT_VERSION:\\s+"${BUILD_NUMBER}"`))
})

test("generated Xcode project carries the same version and build number", () => {
  const versions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(([, v]) => v)
  const builds = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(([, v]) => v)

  assert.ok(versions.length >= 2, "expected Debug and Release marketing versions")
  assert.ok(builds.length >= 2, "expected Debug and Release build numbers")
  assert.deepEqual(new Set(versions), new Set([MARKETING_VERSION]))
  assert.deepEqual(new Set(builds), new Set([BUILD_NUMBER]))
})

test("generated Xcode project signing configs use the Apple development team", () => {
  const configuredTeams = [...pbxproj.matchAll(/DEVELOPMENT_TEAM = ([^;]+);/g)].map(
    ([, team]) => team,
  )

  assert.ok(configuredTeams.length >= 2)
  assert.deepEqual(new Set(configuredTeams), new Set([TEAM_ID]))
})
