import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const iosWorkflow = await readFile(new URL("../.github/workflows/ios.yml", import.meta.url), "utf8")
const verifyWorkflow = await readFile(
  new URL("../.github/workflows/verify.yml", import.meta.url),
  "utf8",
)

// Regression: the iOS app sat un-compilable on main (#395) because CI never
// invoked a compiler. The ios/*.test.mjs suites only regex over Swift source.
test("CI actually compiles the iOS app", () => {
  assert.match(iosWorkflow, /runs-on: macos/)
  assert.match(iosWorkflow, /xcodegen generate/)
  assert.match(iosWorkflow, /xcodebuild/)
  assert.match(iosWorkflow, /-scheme FXRacing/)
})

test("the iOS job only runs when iOS code changes", () => {
  // macOS runners bill at 10x Linux minutes; a web-only PR must not pay it.
  const pathFilters = iosWorkflow.match(/- "ios\/\*\*"/g) ?? []
  assert.ok(
    pathFilters.length >= 2,
    "expected an ios/** path filter on both pull_request and push",
  )
  assert.match(iosWorkflow, /cancel-in-progress: true/)
})

test("the web job stays on Linux and does not build iOS", () => {
  assert.match(verifyWorkflow, /runs-on: ubuntu-latest/)
  assert.doesNotMatch(verifyWorkflow, /xcodebuild/)
})
