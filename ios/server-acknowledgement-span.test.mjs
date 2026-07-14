import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const performanceSource = await readFile(
  new URL("./FXRacing/Core/Performance/FXPerformance.swift", import.meta.url),
  "utf8",
)
const detailModelSource = await readFile(
  new URL(
    "./FXRacing/Features/Races/RaceDetailViewModel.swift",
    import.meta.url,
  ),
  "utf8",
)

test("an abandoned performance span closes without emitting an interval end", () => {
  const abandon = performanceSource.match(
    /func abandon\(\)\s*\{([\s\S]*?)\n    \}/,
  )

  assert.ok(abandon, "FXPerformanceSpan should expose abandon()")
  assert.match(abandon[1], /guard !hasEnded else \{ return \}/)
  assert.match(abandon[1], /hasEnded = true/)
  assert.doesNotMatch(abandon[1], /endInterval/)
})

test("server acknowledgement ends only after the current authoritative result is merged", () => {
  const spanStart = detailModelSource.indexOf(
    "let serverAcknowledgementInterval = FXPerformance.begin(.serverAcknowledgement)",
  )
  const submitEnd = detailModelSource.indexOf(
    "\n    @discardableResult",
    spanStart,
  )

  assert.ok(spanStart >= 0, "submit should begin the server acknowledgement span")
  assert.ok(submitEnd > spanStart, "submit span should be inside submit()")

  const submitSpan = detailModelSource.slice(spanStart, submitEnd)
  const abandon = submitSpan.indexOf(
    "defer { serverAcknowledgementInterval.abandon() }",
  )
  const request = submitSpan.indexOf("await syncManager.submitExplicit(")
  const scopeGuard = submitSpan.indexOf("guard activeScope == scope", request)
  const recordGuard = submitSpan.indexOf(
    "guard let currentRecord = localPickStore.record(id: record.id)",
    scopeGuard,
  )
  const acknowledgement = submitSpan.indexOf(
    "let receivedAuthoritativeAcknowledgement: Bool",
    recordGuard,
  )
  const merge = submitSpan.indexOf(
    "let didApplyTerminalState = applyTerminalState(",
    acknowledgement,
  )
  const end = submitSpan.indexOf("serverAcknowledgementInterval.end()", merge)

  assert.ok(abandon >= 0 && abandon < request)
  assert.ok(request >= 0 && request < scopeGuard)
  assert.ok(scopeGuard < recordGuard)
  assert.ok(recordGuard < acknowledgement)
  assert.ok(acknowledgement < merge)
  assert.ok(merge < end)
  assert.doesNotMatch(
    submitSpan.slice(request, scopeGuard),
    /serverAcknowledgementInterval\.end\(\)/,
  )
  assert.match(
    submitSpan,
    /case \.saved\(let pick\), \.conflict\(let pick\?\), \.expired\(let pick\?\):[\s\S]*?receivedAuthoritativeAcknowledgement = true/,
  )
  assert.match(
    submitSpan,
    /case \.conflict\(nil\), \.expired\(nil\), \.queued, \.unauthorized:[\s\S]*?receivedAuthoritativeAcknowledgement = false/,
  )
  assert.match(
    submitSpan,
    /if didApplyTerminalState \{\s*if receivedAuthoritativeAcknowledgement \{\s*serverAcknowledgementInterval\.end\(\)/,
  )
})
