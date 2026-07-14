#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const signpostGates = [
  {
    displayName: "Duration (LaunchToShell)",
    name: "launch-to-shell",
    threshold: 0.8,
  },
  {
    displayName: "Duration (CachedListPublication)",
    name: "cached-publication",
    threshold: 0.3,
  },
  {
    displayName: "Duration (RaceSelectionReady)",
    name: "race-selection-ready",
    threshold: 0.6,
  },
  {
    displayName: "Duration (DriverPickerPresentation)",
    name: "driver-picker-presentation",
    threshold: 0.5,
  },
  {
    displayName: "Duration (DriverPickerPreparation)",
    name: "driver-picker-preparation",
    threshold: 0.1,
  },
  {
    displayName: "Duration (SchedulePresentation)",
    name: "schedule-presentation",
    threshold: 0.5,
  },
  {
    displayName: "Duration (SaveCompletion)",
    name: "save-completion",
    threshold: 0.2,
  },
]

const requiredGatesByScenario = {
  shell: ["launch-to-shell"],
  "cached-launch": ["launch-to-shell", "cached-publication"],
  offline: ["launch-to-shell", "cached-publication"],
  "race-swipe": ["race-selection-ready"],
  "driver-sheet": ["driver-picker-presentation", "driver-picker-preparation"],
  "schedule-sheet": ["schedule-presentation"],
  "local-save": ["save-completion"],
}

export function requiredSignpostNames(scenario) {
  return requiredGatesByScenario[scenario] ?? []
}

export function signpostDisplayName(name) {
  const gate = signpostGates.find((candidate) => candidate.name === name)
  if (!gate) throw new Error(`Unknown performance gate: ${name}`)
  return gate.displayName.match(/^Duration \((.+)\)$/)?.[1] ?? gate.displayName
}

function percentile(value, ordered) {
  if (ordered.length === 0) return 0
  const rank = Math.ceil((value / 100) * ordered.length)
  return ordered[Math.max(0, Math.min(ordered.length - 1, rank - 1))]
}

export function buildPerformanceResult({
  expectedSampleCount,
  name,
  samples,
  warmups = 0,
}) {
  const gate = signpostGates.find((candidate) => candidate.name === name)
  if (!gate) throw new Error(`Unknown performance gate: ${name}`)

  const finiteSamples = samples.filter((sample) => Number.isFinite(sample))
  const ordered = [...finiteSamples].sort((left, right) => left - right)
  const p50 = percentile(50, ordered)
  const p95 = percentile(95, ordered)
  const resolvedExpectedSampleCount = expectedSampleCount ?? finiteSamples.length

  return {
    name,
    unit: "seconds",
    warmups,
    samples: finiteSamples,
    p50,
    p95,
    threshold: gate.threshold,
    passed: finiteSamples.length > 0
      && finiteSamples.length === resolvedExpectedSampleCount
      && p95 <= gate.threshold,
    enforced: true,
    sampleCount: finiteSamples.length,
    expectedSampleCount: resolvedExpectedSampleCount,
  }
}

export function extractSignpostResults(
  metricsReport,
  { requiredNames = [], expectedSampleCount } = {},
) {
  const metrics = metricsReport.flatMap((test) =>
    (test.testRuns ?? []).flatMap((run) => run.metrics ?? []),
  )
  const required = new Set(requiredNames)

  return signpostGates.flatMap(({ displayName, name }) => {
    const samples = metrics
      .filter((metric) => metric.displayName === displayName)
      .flatMap((metric) => metric.measurements ?? [])
      .filter((sample) => Number.isFinite(sample))

    if (samples.length === 0 && !required.has(name)) return []
    return [buildPerformanceResult({ expectedSampleCount, name, samples })]
  })
}

export function mergeSignpostResults(report, signpostResults) {
  const signpostNames = new Set(signpostResults.map((result) => result.name))
  return {
    ...report,
    generatedAt: new Date().toISOString(),
    results: [
      ...(report.results ?? []).filter((result) => !signpostNames.has(result.name)),
      ...signpostResults,
    ],
  }
}

export function reportPassed(report) {
  return (report.results ?? []).every(
    (result) => result.enforced === false || result.passed,
  )
}

async function main() {
  const [rawPath, metricsPath, scenario, sampleCountValue] = process.argv.slice(2)
  const expectedSampleCount = Number.parseInt(sampleCountValue, 10)
  if (!rawPath || !metricsPath || !scenario || !Number.isInteger(expectedSampleCount)) {
    console.error(
      "Usage: ios-performance-report.mjs <raw.json> <metrics.json> <scenario> <samples>",
    )
    process.exitCode = 2
    return
  }

  const report = JSON.parse(await readFile(rawPath, "utf8"))
  const metrics = JSON.parse(await readFile(metricsPath, "utf8"))
  const merged = mergeSignpostResults(
    report,
    extractSignpostResults(metrics, {
      requiredNames: requiredSignpostNames(scenario),
      expectedSampleCount,
    }),
  )
  await writeFile(rawPath, `${JSON.stringify(merged, null, 2)}\n`)

  for (const result of merged.results) {
    const sampleStatus = result.expectedSampleCount === undefined
      || result.sampleCount === result.expectedSampleCount
      ? ""
      : ` samples=${result.sampleCount}/${result.expectedSampleCount}`
    const status = result.enforced === false
      ? "DIAGNOSTIC"
      : result.passed ? "PASS" : "FAIL"
    console.log(
      `${result.name}: p50=${result.p50.toFixed(3)}s `
        + `p95=${result.p95.toFixed(3)}s `
        + `threshold=${result.threshold.toFixed(3)}s `
        + sampleStatus
        + status,
    )
  }
  if (!reportPassed(merged)) process.exitCode = 1
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main()
