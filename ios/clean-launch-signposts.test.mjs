import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

import {
  buildCleanLaunchArtifacts,
  buildLogShowArguments,
  parseArguments,
  parseLaunchPID,
  parseStructuredLogJSON,
  requiredCachePaths,
  validatePrimedCacheJSON,
} from "../scripts/ios-performance-clean-launch.mjs"
import { buildPerformanceResult } from "../scripts/ios-performance-report.mjs"

const cleanLaunchSource = await readFile(
  new URL("../scripts/ios-performance-clean-launch.mjs", import.meta.url),
  "utf8",
)

const timestamp = (seconds) => `2026-07-14 17:24:${seconds}+0200`

function signpost({
  pid,
  name,
  type,
  time,
  id = "0x1",
  subsystem = "com.fxracing.app",
}) {
  return {
    eventType: "signpostEvent",
    processID: pid,
    signpostID: id,
    signpostName: name,
    signpostType: type,
    subsystem,
    timestamp: time,
  }
}

test("structured signposts pair by process and interval while excluding warmups", () => {
  const launches = [
    { index: 0, phase: "warmup", pid: 101 },
    { index: 0, phase: "sample", pid: 201 },
    { index: 1, phase: "sample", pid: 202 },
  ]
  const records = [
    signpost({ pid: 101, name: "LaunchToShell", type: "begin", time: timestamp("00.000000") }),
    signpost({ pid: 101, name: "LaunchToShell", type: "end", time: timestamp("00.100000") }),
    signpost({ pid: 202, name: "LaunchToShell", type: "begin", time: timestamp("02.000000") }),
    signpost({ pid: 201, name: "LaunchToShell", type: "begin", time: timestamp("01.000000") }),
    signpost({ pid: 201, name: "CachedListPublication", type: "begin", time: timestamp("01.100000"), id: "0x2" }),
    signpost({ pid: 201, name: "CachedListPublication", type: "end", time: timestamp("01.140000"), id: "0x2" }),
    signpost({ pid: 201, name: "LaunchToShell", type: "end", time: timestamp("01.720000") }),
    signpost({ pid: 202, name: "CachedListPublication", type: "begin", time: timestamp("02.200000"), id: "0x2" }),
    signpost({ pid: 202, name: "CachedListPublication", type: "end", time: timestamp("02.260000"), id: "0x2" }),
    signpost({ pid: 202, name: "LaunchToShell", type: "end", time: timestamp("02.770000") }),
    signpost({
      pid: 201,
      name: "LaunchToShell",
      type: "begin",
      time: timestamp("03.000000"),
      subsystem: "another.app",
    }),
  ]

  const { audit, report } = buildCleanLaunchArtifacts({
    generatedAt: "2026-07-14T15:24:10.000Z",
    launches,
    records,
    sampleCount: 2,
    scenario: "cached-launch",
    warmups: 1,
  })

  assert.deepEqual(
    report.results.map(({ name, samples, p50, p95, threshold, passed }) => ({
      name,
      samples: samples.map((sample) => Number(sample.toFixed(3))),
      p50: Number(p50.toFixed(3)),
      p95: Number(p95.toFixed(3)),
      threshold,
      passed,
    })),
    [
      {
        name: "launch-to-shell",
        samples: [0.72, 0.77],
        p50: 0.72,
        p95: 0.77,
        threshold: 0.8,
        passed: true,
      },
      {
        name: "cached-publication",
        samples: [0.04, 0.06],
        p50: 0.04,
        p95: 0.06,
        threshold: 0.3,
        passed: true,
      },
    ],
  )
  assert.equal(report.passed, true)
  assert.equal(report.sampleCount, 2)
  assert.equal(report.warmups, 1)
  assert.equal(audit.collector, "normal-simctl-launch")
  assert.equal(audit.scenario, "cached-launch")
  assert.deepEqual(audit.runs, launches)
  assert.deepEqual(audit.events, records)
  assert.deepEqual(
    audit.intervals.map(({ name, pid, launchIndex }) => ({ name, pid, launchIndex })),
    [
      { name: "LaunchToShell", pid: 201, launchIndex: 0 },
      { name: "CachedListPublication", pid: 201, launchIndex: 0 },
      { name: "LaunchToShell", pid: 202, launchIndex: 1 },
      { name: "CachedListPublication", pid: 202, launchIndex: 1 },
    ],
  )
})

test("missing required intervals are rejected instead of producing partial samples", () => {
  const launches = [
    { index: 0, phase: "sample", pid: 301 },
    { index: 1, phase: "sample", pid: 302 },
  ]
  const records = [
    signpost({ pid: 301, name: "LaunchToShell", type: "begin", time: timestamp("10.000000") }),
    signpost({ pid: 301, name: "LaunchToShell", type: "end", time: timestamp("10.500000") }),
    signpost({ pid: 302, name: "LaunchToShell", type: "begin", time: timestamp("11.000000") }),
  ]

  assert.throws(
    () => buildCleanLaunchArtifacts({
      launches,
      records,
      sampleCount: 2,
      scenario: "shell",
      warmups: 0,
    }),
    /Missing end for LaunchToShell on sample PID 302/,
  )
})

test("duplicate PIDs, duplicate intervals, and negative intervals are rejected", () => {
  const duplicatePIDLaunches = [
    { index: 0, phase: "warmup", pid: 401 },
    { index: 0, phase: "sample", pid: 401 },
  ]
  assert.throws(
    () => buildCleanLaunchArtifacts({
      launches: duplicatePIDLaunches,
      records: [],
      sampleCount: 1,
      scenario: "shell",
      warmups: 1,
    }),
    /Duplicate launch PID: 401/,
  )

  const launch = [{ index: 0, phase: "sample", pid: 402 }]
  const duplicate = [
    signpost({ pid: 402, name: "LaunchToShell", type: "begin", time: timestamp("12.000000") }),
    signpost({ pid: 402, name: "LaunchToShell", type: "end", time: timestamp("12.200000") }),
    signpost({ pid: 402, name: "LaunchToShell", type: "begin", time: timestamp("12.300000"), id: "0x2" }),
    signpost({ pid: 402, name: "LaunchToShell", type: "end", time: timestamp("12.400000"), id: "0x2" }),
  ]
  assert.throws(
    () => buildCleanLaunchArtifacts({
      launches: launch,
      records: duplicate,
      sampleCount: 1,
      scenario: "shell",
      warmups: 0,
    }),
    /Duplicate LaunchToShell interval for sample PID 402/,
  )

  const negative = [
    signpost({ pid: 402, name: "LaunchToShell", type: "begin", time: timestamp("13.500000") }),
    signpost({ pid: 402, name: "LaunchToShell", type: "end", time: timestamp("13.400000") }),
  ]
  assert.throws(
    () => buildCleanLaunchArtifacts({
      launches: launch,
      records: negative,
      sampleCount: 1,
      scenario: "shell",
      warmups: 0,
    }),
    /Negative LaunchToShell interval for sample PID 402/,
  )
})

test("the shared result builder owns signpost thresholds and percentile rules", () => {
  assert.deepEqual(
    buildPerformanceResult({
      expectedSampleCount: 2,
      name: "launch-to-shell",
      samples: [0.81, 0.4],
      warmups: 3,
    }),
    {
      name: "launch-to-shell",
      unit: "seconds",
      warmups: 3,
      samples: [0.81, 0.4],
      p50: 0.4,
      p95: 0.81,
      threshold: 0.8,
      passed: false,
      enforced: true,
      sampleCount: 2,
      expectedSampleCount: 2,
    },
  )
})

test("the clean runner parses its complete CLI and production cache locations", () => {
  assert.deepEqual(
    parseArguments([
      "--udid", "SIM-123",
      "--scenario", "offline",
      "--app", "/tmp/FXRacing.app",
      "--output", "/tmp/performance-output",
      "--warmups", "2",
      "--samples", "5",
    ]),
    {
      app: "/tmp/FXRacing.app",
      output: "/tmp/performance-output",
      samples: 5,
      scenario: "offline",
      udid: "SIM-123",
      warmups: 2,
    },
  )
  assert.throws(
    () => parseArguments(["--udid", "SIM-123", "--scenario", "image"]),
    /Unsupported scenario: image/,
  )
  assert.deepEqual(
    requiredCachePaths("/container"),
    [
      "/container/Library/Caches/FXRacing/RaceSnapshots/v1/list.json",
      "/container/Library/Caches/FXRacing/RaceSnapshots/v1/detail-c3Bh.json",
    ],
  )
  assert.equal(
    validatePrimedCacheJSON(
      JSON.stringify({ races: [{ id: "spa" }, { id: "monza" }] }),
      JSON.stringify({ race: { id: "spa" }, entrants: [{ id: "leclerc" }] }),
    ),
    true,
  )
  assert.throws(
    () => validatePrimedCacheJSON(
      JSON.stringify({ races: [{ id: "spa" }] }),
      JSON.stringify({ race: { id: "spa" }, entrants: [] }),
    ),
    /nonempty spa entrants/,
  )
})

test("structured log and simctl launch output parsing are deterministic", () => {
  const records = [
    signpost({ pid: 501, name: "LaunchToShell", type: "begin", time: timestamp("20.000000") }),
  ]

  assert.deepEqual(parseStructuredLogJSON(JSON.stringify(records)), records)
  assert.equal(parseLaunchPID("com.fxracing.app: 501\n", "com.fxracing.app"), 501)
  assert.throws(
    () => parseLaunchPID("com.fxracing.app: not-a-pid", "com.fxracing.app"),
    /Could not parse launched process ID/,
  )
  assert.doesNotMatch(
    cleanLaunchSource,
    /Date\.parse/,
    "structured timestamps must retain microseconds instead of rounding through Date",
  )
  assert.deepEqual(
    buildLogShowArguments({
      startedAt: new Date("2026-07-14T15:20:01.000Z"),
      fallbackSeconds: 90,
    }),
    [
      "show",
      "--start", "2026-07-14 15:20:01+0000",
      "--style", "json",
      "--signpost",
      "--predicate", 'subsystem == "com.fxracing.app"',
    ],
  )
  assert.deepEqual(
    buildLogShowArguments({ startedAt: null, fallbackSeconds: 90 }),
    [
      "show",
      "--last", "90",
      "--style", "json",
      "--signpost",
      "--predicate", 'subsystem == "com.fxracing.app"',
    ],
  )
})
