#!/usr/bin/env node

import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildPerformanceResult,
  reportPassed,
  requiredSignpostNames,
  signpostDisplayName,
} from "./ios-performance-report.mjs"

const bundleSubsystem = "com.fxracing.app"
const collectorName = "normal-simctl-launch"
const measuredLaunchDelayMilliseconds = 2_000
const supportedScenarios = new Set(["shell", "cached-launch", "offline"])

function usage() {
  return "Usage: ios-performance-clean-launch.mjs --udid <simulator-udid> --scenario <shell|cached-launch|offline> --app <FXRacing.app> --output <dir> [--warmups <count>] [--samples <count>]"
}

function parseCount(value, name, { allowZero }) {
  const pattern = allowZero ? /^\d+$/ : /^[1-9]\d*$/
  if (!pattern.test(value ?? "")) {
    throw new Error(`${name} must be ${allowZero ? "zero or greater" : "greater than zero"}.`)
  }
  return Number.parseInt(value, 10)
}

export function parseArguments(argumentsList) {
  const options = { warmups: 3, samples: 30 }

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    const value = argumentsList[index + 1]
    if (!["--udid", "--scenario", "--app", "--output", "--warmups", "--samples"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`)
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`)
    }

    switch (argument) {
      case "--udid":
        options.udid = value
        break
      case "--scenario":
        options.scenario = value
        break
      case "--app":
        options.app = value
        break
      case "--output":
        options.output = value
        break
      case "--warmups":
        options.warmups = parseCount(value, "Warmups", { allowZero: true })
        break
      case "--samples":
        options.samples = parseCount(value, "Samples", { allowZero: false })
        break
    }
    index += 1
  }

  if (options.scenario && !supportedScenarios.has(options.scenario)) {
    throw new Error(`Unsupported scenario: ${options.scenario}`)
  }
  for (const name of ["udid", "scenario", "app", "output"]) {
    if (!options[name]) throw new Error(`Missing required --${name} argument.`)
  }
  return options
}

export function parseStructuredLogJSON(contents) {
  const trimmed = contents.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.entries)) return parsed.entries
    return [parsed]
  } catch (error) {
    const records = trimmed
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
    if (records.length > 0) return records
    throw error
  }
}

export function parseLaunchPID(output, bundleIdentifier) {
  const escapedBundleIdentifier = bundleIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = output.match(new RegExp(`${escapedBundleIdentifier}:\\s*(\\d+)`))
  const pid = Number.parseInt(match?.[1] ?? "", 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Could not parse launched process ID for ${bundleIdentifier}.`)
  }
  return pid
}

export function requiredCachePaths(containerPath) {
  const snapshotDirectory = join(
    containerPath,
    "Library",
    "Caches",
    "FXRacing",
    "RaceSnapshots",
    "v1",
  )
  return [
    join(snapshotDirectory, "list.json"),
    join(snapshotDirectory, "detail-c3Bh.json"),
  ]
}

export function validatePrimedCacheJSON(listContents, detailContents) {
  let list
  let detail
  try {
    list = JSON.parse(listContents)
    detail = JSON.parse(detailContents)
  } catch (error) {
    throw new Error(`Production cache prime did not write valid JSON: ${error.message}`)
  }

  if (!Array.isArray(list?.races) || !list.races.some((race) => race?.id === "spa")) {
    throw new Error("Production cache prime must include spa in the race list.")
  }
  if (detail?.race?.id !== "spa") {
    throw new Error("Production cache prime must write the spa race detail.")
  }
  if (!Array.isArray(detail?.entrants) || detail.entrants.length === 0) {
    throw new Error("Production cache prime must write nonempty spa entrants.")
  }
  return true
}

function parseTimestampMicroseconds(value) {
  const match = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}:?\d{2})$/,
  )
  if (!match) throw new Error(`Unsupported structured log timestamp: ${value}`)

  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map((part) => Number.parseInt(part, 10))
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ]
  if (
    month < 1 || month > 12
    || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59
  ) {
    throw new Error(`Unsupported structured log timestamp: ${value}`)
  }

  const adjustedYear = year - (month <= 2 ? 1 : 0)
  const era = Math.floor(adjustedYear / 400)
  const yearOfEra = adjustedYear - era * 400
  const adjustedMonth = month + (month > 2 ? -3 : 9)
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1
  const dayOfEra = yearOfEra * 365
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
    + dayOfYear
  const epochDays = BigInt(era * 146_097 + dayOfEra - 719_468)

  const offset = match[8]
  let offsetSeconds = 0
  if (offset !== "Z") {
    const sign = offset.startsWith("-") ? -1 : 1
    const digits = offset.slice(1).replace(":", "")
    const offsetHours = Number.parseInt(digits.slice(0, 2), 10)
    const offsetMinutes = Number.parseInt(digits.slice(2), 10)
    if (offsetHours > 23 || offsetMinutes > 59) {
      throw new Error(`Unsupported structured log timestamp: ${value}`)
    }
    offsetSeconds = sign * (offsetHours * 3_600 + offsetMinutes * 60)
  }

  const wholeSeconds = epochDays * 86_400n
    + BigInt(hour * 3_600 + minute * 60 + second - offsetSeconds)
  const fractionalMicroseconds = BigInt(
    (match[7] ?? "").slice(0, 6).padEnd(6, "0") || "0",
  )
  return wholeSeconds * 1_000_000n + fractionalMicroseconds
}

function normalizedSignpostType(value) {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "")
  if (normalized.endsWith("begin")) return "begin"
  if (normalized.endsWith("end")) return "end"
  return null
}

function validateRuns(runs, warmups, sampleCount) {
  const seenPIDs = new Set()
  for (const run of runs) {
    if (!Number.isInteger(run.pid) || run.pid <= 0) {
      throw new Error(`Invalid launch PID: ${run.pid}`)
    }
    if (seenPIDs.has(run.pid)) throw new Error(`Duplicate launch PID: ${run.pid}`)
    seenPIDs.add(run.pid)
  }

  const warmupRuns = runs.filter((run) => run.phase === "warmup")
  const sampleRuns = runs.filter((run) => run.phase === "sample")
  if (warmupRuns.length !== warmups) {
    throw new Error(`Expected ${warmups} warmup launches, found ${warmupRuns.length}.`)
  }
  if (sampleRuns.length !== sampleCount) {
    throw new Error(`Expected ${sampleCount} sample launches, found ${sampleRuns.length}.`)
  }
  return sampleRuns
}

function pairRequiredIntervals(records, runs, resultNames) {
  const sampleRuns = runs.filter((run) => run.phase === "sample")
  const sampleByPID = new Map(sampleRuns.map((run) => [run.pid, run]))
  const displayNameByResult = new Map(
    resultNames.map((name) => [name, signpostDisplayName(name)]),
  )
  const resultNameByDisplay = new Map(
    [...displayNameByResult].map(([resultName, displayName]) => [displayName, resultName]),
  )
  const pending = new Map()
  const completed = new Map()

  for (const record of records) {
    if (record?.subsystem !== bundleSubsystem) continue
    const pid = Number(record.processID)
    const run = sampleByPID.get(pid)
    const resultName = resultNameByDisplay.get(record.signpostName)
    const type = normalizedSignpostType(record.signpostType)
    if (!run || !resultName || !type) continue

    const signpostID = String(record.signpostID ?? "implicit")
    const intervalKey = `${pid}\u0000${record.signpostName}\u0000${signpostID}`
    const sampleKey = `${pid}\u0000${record.signpostName}`
    if (type === "begin") {
      if (pending.has(intervalKey)) {
        throw new Error(`Duplicate begin for ${record.signpostName} on sample PID ${pid}.`)
      }
      pending.set(intervalKey, record)
      continue
    }

    const begin = pending.get(intervalKey)
    if (!begin) {
      throw new Error(`Missing begin for ${record.signpostName} on sample PID ${pid}.`)
    }
    pending.delete(intervalKey)
    if (completed.has(sampleKey)) {
      throw new Error(`Duplicate ${record.signpostName} interval for sample PID ${pid}.`)
    }

    const beginMicroseconds = parseTimestampMicroseconds(begin.timestamp)
    const endMicroseconds = parseTimestampMicroseconds(record.timestamp)
    const elapsedMicroseconds = endMicroseconds - beginMicroseconds
    if (elapsedMicroseconds < 0n) {
      throw new Error(`Negative ${record.signpostName} interval for sample PID ${pid}.`)
    }
    completed.set(sampleKey, {
      beginTimestamp: begin.timestamp,
      durationSeconds: Number(elapsedMicroseconds) / 1_000_000,
      endTimestamp: record.timestamp,
      launchIndex: run.index,
      name: record.signpostName,
      pid,
      resultName,
      signpostID,
    })
  }

  if (pending.size > 0) {
    const [key] = pending.keys()
    const [pid, name] = key.split("\u0000")
    throw new Error(`Missing end for ${name} on sample PID ${pid}.`)
  }
  for (const run of sampleRuns) {
    for (const displayName of displayNameByResult.values()) {
      if (!completed.has(`${run.pid}\u0000${displayName}`)) {
        throw new Error(`Missing ${displayName} interval for sample PID ${run.pid}.`)
      }
    }
  }

  const displayOrder = new Map(
    [...displayNameByResult.values()].map((name, index) => [name, index]),
  )
  return [...completed.values()].sort(
    (left, right) => left.launchIndex - right.launchIndex
      || displayOrder.get(left.name) - displayOrder.get(right.name),
  )
}

export function buildCleanLaunchArtifacts({
  generatedAt = new Date().toISOString(),
  launches,
  records,
  sampleCount,
  scenario,
  warmups,
}) {
  if (!supportedScenarios.has(scenario)) throw new Error(`Unsupported scenario: ${scenario}`)
  validateRuns(launches, warmups, sampleCount)

  const resultNames = requiredSignpostNames(scenario)
  const intervals = pairRequiredIntervals(records, launches, resultNames)
  const results = resultNames.map((name) => buildPerformanceResult({
    expectedSampleCount: sampleCount,
    name,
    samples: intervals
      .filter((interval) => interval.resultName === name)
      .map((interval) => interval.durationSeconds),
    warmups,
  }))
  const report = {
    collector: collectorName,
    generatedAt,
    passed: false,
    results,
    sampleCount,
    scenario,
    schemaVersion: 1,
    warmups,
  }
  report.passed = reportPassed(report)

  return {
    audit: {
      collector: collectorName,
      events: records,
      generatedAt,
      intervals,
      runs: launches,
      scenario,
      schemaVersion: 1,
    },
    report,
  }
}

export function buildLogShowArguments({ startedAt, fallbackSeconds }) {
  const timeRange = startedAt instanceof Date && Number.isFinite(startedAt.getTime())
    ? ["--start", `${startedAt.toISOString().slice(0, 19).replace("T", " ")}+0000`]
    : ["--last", String(Math.max(1, Math.ceil(fallbackSeconds)))]
  return [
    "show",
    ...timeRange,
    "--style", "json",
    "--signpost",
    "--predicate", `subsystem == "${bundleSubsystem}"`,
  ]
}

function run(command, argumentsList, { allowFailure = false, environment } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, argumentsList, {
      env: environment ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", rejectRun)
    child.on("close", (status) => {
      if (status === 0 || allowFailure) {
        resolveRun({ status, stderr, stdout })
        return
      }
      rejectRun(new Error(
        `${command} ${argumentsList.join(" ")} failed (${status}): ${stderr.trim()}`,
      ))
    })
  })
}

const delay = (milliseconds) => new Promise((resolveDelay) => {
  setTimeout(resolveDelay, milliseconds)
})

async function launchApplication({ appScenario, bundleIdentifier, udid }) {
  const result = await run(
    "xcrun",
    [
      "simctl", "launch", "--terminate-running-process",
      udid,
      bundleIdentifier,
      "--performance-scenario", appScenario,
    ],
    {
      environment: {
        ...process.env,
        SIMCTL_CHILD_FX_PERFORMANCE_SAMPLE_ID: randomUUID(),
      },
    },
  )
  return parseLaunchPID(`${result.stdout}\n${result.stderr}`, bundleIdentifier)
}

async function waitForProductionCache({ bundleIdentifier, udid }) {
  const deadline = Date.now() + 10_000
  let lastError = new Error("The app data container was not available.")

  while (Date.now() < deadline) {
    try {
      const containerResult = await run(
        "xcrun",
        ["simctl", "get_app_container", udid, bundleIdentifier, "data"],
      )
      const cachePaths = requiredCachePaths(containerResult.stdout.trim())
      const [listContents, detailContents] = await Promise.all(
        cachePaths.map((path) => readFile(path, "utf8")),
      )
      validatePrimedCacheJSON(listContents, detailContents)
      return
    } catch (error) {
      lastError = error
      await delay(100)
    }
  }
  throw new Error(`Production cache prime timed out: ${lastError.message}`)
}

async function primeProductionCache({ bundleIdentifier, udid }) {
  const pid = await launchApplication({
    appScenario: "cache-prime",
    bundleIdentifier,
    udid,
  })
  try {
    await waitForProductionCache({ bundleIdentifier, udid })
  } finally {
    await run(
      "xcrun",
      ["simctl", "terminate", udid, bundleIdentifier],
      { allowFailure: true },
    )
  }
  return pid
}

async function bundleIdentifierForApp(appPath) {
  const result = await run(
    "plutil",
    ["-extract", "CFBundleIdentifier", "raw", "-o", "-", join(appPath, "Info.plist")],
  )
  const bundleIdentifier = result.stdout.trim()
  if (!bundleIdentifier) throw new Error("The app bundle has no CFBundleIdentifier.")
  return bundleIdentifier
}

async function collectStructuredLogs({ fallbackSeconds, startedAt, udid }) {
  const [, ...showOptions] = buildLogShowArguments({ fallbackSeconds, startedAt })
  const result = await run(
    "xcrun",
    ["simctl", "spawn", udid, "log", "show", ...showOptions],
  )
  return parseStructuredLogJSON(result.stdout)
}

async function main() {
  if (process.argv.slice(2).some((argument) => argument === "-h" || argument === "--help")) {
    console.log(usage())
    return
  }

  const options = parseArguments(process.argv.slice(2))
  await mkdir(options.output, { recursive: true })
  const bundleIdentifier = await bundleIdentifierForApp(options.app)

  await run(
    "xcrun",
    ["simctl", "terminate", options.udid, bundleIdentifier],
    { allowFailure: true },
  )
  await run(
    "xcrun",
    ["simctl", "uninstall", options.udid, bundleIdentifier],
    { allowFailure: true },
  )
  await run("xcrun", ["simctl", "install", options.udid, options.app])

  const startedAt = new Date()
  const launches = []
  const measuredScenario = options.scenario === "shell"
    ? "cached-launch"
    : options.scenario

  try {
    const primePID = await primeProductionCache({
      bundleIdentifier,
      udid: options.udid,
    })
    launches.push({
      index: 0,
      phase: "prime",
      pid: primePID,
      scenario: "cache-prime",
    })

    for (const phase of ["warmup", "sample"]) {
      const count = phase === "warmup" ? options.warmups : options.samples
      for (let index = 0; index < count; index += 1) {
        const pid = await launchApplication({
          appScenario: measuredScenario,
          bundleIdentifier,
          udid: options.udid,
        })
        if (launches.some((run) => run.pid === pid)) {
          throw new Error(`Duplicate launch PID: ${pid}`)
        }
        launches.push({ index, phase, pid, scenario: measuredScenario })
        await delay(measuredLaunchDelayMilliseconds)
      }
    }
  } finally {
    await run(
      "xcrun",
      ["simctl", "terminate", options.udid, bundleIdentifier],
      { allowFailure: true },
    )
  }

  const fallbackSeconds = Math.ceil(
    (options.warmups + options.samples + 1) * (measuredLaunchDelayMilliseconds / 1_000) + 20,
  )
  const records = await collectStructuredLogs({
    fallbackSeconds,
    startedAt,
    udid: options.udid,
  })
  const generatedAt = new Date().toISOString()
  const auditPath = join(options.output, "signposts.json")
  const baseAudit = {
    collector: collectorName,
    events: records,
    generatedAt,
    intervals: [],
    runs: launches,
    scenario: options.scenario,
    schemaVersion: 1,
  }
  await writeFile(auditPath, `${JSON.stringify(baseAudit, null, 2)}\n`)

  const { audit, report } = buildCleanLaunchArtifacts({
    generatedAt,
    launches,
    records,
    sampleCount: options.samples,
    scenario: options.scenario,
    warmups: options.warmups,
  })
  await Promise.all([
    writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`),
    writeFile(join(options.output, "raw.json"), `${JSON.stringify(report, null, 2)}\n`),
  ])

  for (const result of report.results) {
    console.log(
      `${result.name}: p50=${result.p50.toFixed(3)}s `
        + `p95=${result.p95.toFixed(3)}s `
        + `threshold=${result.threshold.toFixed(3)}s `
        + `${result.passed ? "PASS" : "FAIL"}`,
    )
  }
  console.log(`Artifacts: ${options.output}`)
  if (!report.passed) process.exitCode = 1
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    await main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
