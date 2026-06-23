import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Rankings/LeaderboardViewModel.swift", import.meta.url),
  "utf8",
)

const loadBlock = source.match(/func load\(token:[\s\S]*?\n    \}/)?.[0]

test("LeaderboardViewModel discards stale scope load responses", () => {
  assert.ok(loadBlock, "load(token:) should exist")

  assert.match(
    source,
    /private var loadGeneration = 0/,
    "view model should track the latest leaderboard load generation",
  )
  assert.match(
    source,
    /var scope: Scope = \.global \{[\s\S]*didSet \{[\s\S]*guard oldValue != scope else \{ return \}[\s\S]*loadGeneration \+= 1[\s\S]*isLoading = false/,
    "changing scope should invalidate any in-flight load and stop the stale loading state",
  )

  const generationIndex = loadBlock.indexOf("loadGeneration += 1")
  const snapshotIndex = loadBlock.indexOf("let requestedScope = scope")
  const requestIndex = loadBlock.indexOf(".leaderboard(scope: requestedScope.rawValue")
  const successGuardIndex = loadBlock.indexOf("guard generation == loadGeneration, scope == requestedScope else { return }")
  const rowsIndex = loadBlock.indexOf("rows = response.rows")
  const catchIndex = loadBlock.indexOf("} catch {")
  const errorGuardIndex = loadBlock.indexOf(
    "guard generation == loadGeneration, scope == requestedScope else { return }",
    catchIndex,
  )
  const errorIndex = loadBlock.indexOf("errorMessage = error.localizedDescription")
  const loadingGuardIndex = loadBlock.indexOf("if generation == loadGeneration, scope == requestedScope")
  const loadingDoneIndex = loadBlock.indexOf("isLoading = false", loadingGuardIndex)

  assert.notEqual(generationIndex, -1, "load should reserve a generation before requesting")
  assert.notEqual(snapshotIndex, -1, "load should snapshot the requested scope")
  assert.notEqual(requestIndex, -1, "request should use the snapshotted scope")
  assert.notEqual(successGuardIndex, -1, "successful responses should be guarded")
  assert.notEqual(rowsIndex, -1, "successful responses should assign rows")
  assert.notEqual(catchIndex, -1, "load should handle request failures")
  assert.notEqual(errorGuardIndex, -1, "failed stale responses should be guarded")
  assert.notEqual(errorIndex, -1, "current failed responses should assign the error")
  assert.notEqual(loadingGuardIndex, -1, "loading cleanup should be guarded")
  assert.notEqual(loadingDoneIndex, -1, "current load should clear loading")

  assert.ok(generationIndex < requestIndex, "generation should be captured before the request")
  assert.ok(snapshotIndex < requestIndex, "scope should be snapshotted before the request")
  assert.ok(requestIndex < successGuardIndex, "success guard should run after the response")
  assert.ok(successGuardIndex < rowsIndex, "rows should only update after stale-response guard")
  assert.ok(catchIndex < errorGuardIndex, "error guard should run inside catch")
  assert.ok(errorGuardIndex < errorIndex, "errors should only update after stale-response guard")
  assert.ok(loadingGuardIndex < loadingDoneIndex, "loading state should only clear for the current load")
})
