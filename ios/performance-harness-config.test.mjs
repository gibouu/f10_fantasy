import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const projectYml = await readFile(new URL("./project.yml", import.meta.url), "utf8")
const normalScheme = await readFile(
  new URL("./FXRacing.xcodeproj/xcshareddata/xcschemes/FXRacing.xcscheme", import.meta.url),
  "utf8",
)
const performanceScheme = await readFile(
  new URL(
    "./FXRacing.xcodeproj/xcshareddata/xcschemes/FXRacingPerformance.xcscheme",
    import.meta.url,
  ),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return ""
  throw error
})

function appConfig(name) {
  const match = projectYml.match(
    new RegExp(`^ {8}${name}:\\n(?:^ {10}.*\\n?)*`, "m"),
  )

  assert.ok(match, `${name} app configuration should exist`)
  return match[0]
}

test("native tests are app-hosted and the performance harness cannot ship", () => {
  const debugConfig = appConfig("Debug")
  const performanceConfig = appConfig("Performance")
  const releaseConfig = appConfig("Release")

  assert.match(projectYml, /FXRacingTests:\s*\n\s*type: bundle\.unit-test/)
  assert.match(projectYml, /FXRacingUITests:\s*\n\s*type: bundle\.ui-testing/)
  assert.match(projectYml, /Performance: release/)
  assert.match(performanceConfig, /SWIFT_ACTIVE_COMPILATION_CONDITIONS: FX_PERF_HARNESS/)
  assert.match(performanceConfig, /SUPPORTED_PLATFORMS: iphonesimulator/)
  assert.match(performanceConfig, /CODE_SIGNING_ALLOWED: NO/)
  assert.match(performanceConfig, /ENABLE_TESTABILITY: YES/)
  assert.doesNotMatch(debugConfig, /FX_PERF_HARNESS/)
  assert.doesNotMatch(releaseConfig, /FX_PERF_HARNESS/)
  assert.match(normalScheme, /<ArchiveAction[\s\S]*buildConfiguration = "Release"/)
  assert.match(performanceScheme, /<ArchiveAction[\s\S]*buildConfiguration = "Release"/)
  assert.doesNotMatch(
    performanceScheme,
    /<ArchiveAction[\s\S]*buildConfiguration = "Performance"/,
  )
})
