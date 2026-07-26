import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const sheet = await readFile(
  new URL("./FXRacing/Features/Races/LegacyPickRecoverySheet.swift", import.meta.url),
  "utf8",
).catch(() => "")
const session = await readFile(
  new URL("./FXRacing/Features/Races/LegacyRecoveryPresentationSession.swift", import.meta.url),
  "utf8",
).catch(() => "")
const shell = await readFile(
  new URL("./FXRacing/Features/Home/MainShellView.swift", import.meta.url),
  "utf8",
)
const deck = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
)
const panel = await readFile(
  new URL("./FXRacing/Features/Races/RacePickPanel.swift", import.meta.url),
  "utf8",
)

test("MainShell owns one app-session recovery registry above section switching", () => {
  assert.match(session, /final class LegacyRecoveryPresentationSession/)
  assert.match(session, /func claim\(raceID: String, privateScopeID: String\) -> Bool/)
  assert.match(shell, /@State private var legacyRecoveryPresentationSession/)
  assert.equal(
    shell.match(/LegacyRecoveryPresentationSession\(\)/g)?.length,
    1,
    "the shell should create exactly one registry reference",
  )
  assert.match(
    shell,
    /RaceDeckView\([\s\S]*?legacyRecoveryPresentationSession:[\s\S]*?section: \.upcoming/,
  )
  assert.match(
    shell,
    /RaceDeckView\([\s\S]*?legacyRecoveryPresentationSession:[\s\S]*?section: \.past/,
  )
})

test("recovery stays in a separate opaque native sheet with plain-language copy", () => {
  assert.match(
    deck,
    /\.sheet\([\s\S]*?item: \$legacyRecoveryPresentation,[\s\S]*?onDismiss:/,
  )
  assert.match(sheet, /Picks found on this iPhone/)
  assert.match(sheet, /These picks were saved by an older version of F10/)
  assert.match(sheet, /Use on this iPhone/)
  assert.match(sheet, /Use these picks/)
  assert.match(sheet, /Keep current picks/)
  assert.match(sheet, /Replace with found picks/)
  assert.match(sheet, /Discard/)
  assert.match(sheet, /Not now/)
  assert.match(sheet, /Checking account picks\.\.\./)
  assert.match(sheet, /Connect to check account picks/)
  assert.match(sheet, /Retry/)
  assert.match(sheet, /\.presentationDetents\(\[\.medium, \.large\]\)/)
  assert.match(sheet, /Color\(uiColor: \.systemBackground\)/)
  assert.match(sheet, /minHeight: 44/)
  assert.doesNotMatch(panel, /LegacyPickRecoverySheet|Review device picks/)
})

test("recovery actions preserve source on dismissal and confirm replacement", () => {
  assert.match(deck, /onDismiss:[\s\S]*?dismissLegacyRecovery/)
  assert.match(sheet, /confirmationDialog\(/)
  assert.match(sheet, /Replace current picks\?/)
  assert.match(deck, /case \.notNow:[\s\S]*?dismissLegacyRecovery/)
  assert.doesNotMatch(deck, /case \.notNow:[\s\S]*?resolveLegacyConflict/)
})

test("recovery action-time validation uses owner scope, source and destination revisions", () => {
  assert.match(deck, /expectedLegacyRevision: presentation\.legacyRevision/)
  assert.match(deck, /expectedDestinationRevision: presentation\.destinationRevision/)
  assert.match(deck, /expectedServerPick: presentation\.serverPick/)
  assert.match(deck, /token: authManager\.accessToken/)
  assert.match(deck, /userID: authManager\.authenticatedUser\?\.id/)
  assert.match(deck, /syncCommittedPick\(/)
})
