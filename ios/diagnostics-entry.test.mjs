import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const settings = await readFile(
  new URL("./FXRacing/Features/Profile/SettingsView.swift", import.meta.url),
  "utf8",
)
const guestProfile = await readFile(
  new URL("./FXRacing/Features/Profile/GuestProfileView.swift", import.meta.url),
  "utf8",
)

function assertDebugDiagnosticsEntry(source, surfaceName) {
  const debugBlock = /#if DEBUG[\s\S]*NavigationLink[\s\S]*DiagnosticsView\(\)[\s\S]*Text\("Diagnostics"\)[\s\S]*#endif/

  assert.match(
    source,
    debugBlock,
    `${surfaceName} should expose DiagnosticsView behind a DEBUG-only NavigationLink`,
  )
  assert.doesNotMatch(
    source.replace(/#if DEBUG[\s\S]*?#endif/g, ""),
    /DiagnosticsView\(\)|Text\("Diagnostics"\)/,
    `${surfaceName} should not reference diagnostics outside DEBUG blocks`,
  )
}

test("SettingsView exposes DiagnosticsView only in DEBUG builds", () => {
  assertDebugDiagnosticsEntry(settings, "SettingsView")
})

test("GuestProfileView exposes DiagnosticsView only in DEBUG builds", () => {
  assertDebugDiagnosticsEntry(guestProfile, "GuestProfileView")
})
