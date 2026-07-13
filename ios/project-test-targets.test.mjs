import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const projectYml = await readFile(new URL("./project.yml", import.meta.url), "utf8")
const pbxproj = await readFile(
  new URL("./FXRacing.xcodeproj/project.pbxproj", import.meta.url),
  "utf8",
)

test("native test targets depend on the application target", () => {
  assert.match(
    projectYml,
    /FXRacingTests:[\s\S]*?dependencies:\s*\n\s*- target: FXRacing[\s\S]*?FXRacingUITests:/,
  )
  assert.match(
    projectYml,
    /FXRacingUITests:[\s\S]*?dependencies:\s*\n\s*- target: FXRacing/,
  )
})

test("generated project contains exactly the application and native test targets", () => {
  const nativeTargets = [
    ...pbxproj.matchAll(/\/\* ([^*]+) \*\/ = \{\n\s+isa = PBXNativeTarget;/g),
  ].map(([, target]) => target)

  assert.deepEqual(nativeTargets.sort(), ["FXRacing", "FXRacingTests", "FXRacingUITests"])
})
