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
const performanceDependencies = await readFile(
  new URL("./FXRacing/Performance/PerformanceAppDependencies.swift", import.meta.url),
  "utf8",
)
const deterministicProtocol = await readFile(
  new URL("./FXRacing/Performance/DeterministicFailureURLProtocol.swift", import.meta.url),
  "utf8",
)
const appSource = await readFile(
  new URL("./FXRacing/FXRacingApp.swift", import.meta.url),
  "utf8",
)
const shellSource = await readFile(
  new URL("./FXRacing/Features/Home/MainShellView.swift", import.meta.url),
  "utf8",
)
const performanceFixtures = await readFile(
  new URL("./FXRacing/Performance/PerformanceFixtures.swift", import.meta.url),
  "utf8",
)
const performanceUITests = await readFile(
  new URL("./FXRacingUITests/FXRacingPerformanceTests.swift", import.meta.url),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return ""
  throw error
})
const performanceResult = await readFile(
  new URL("./FXRacingUITests/PerformanceResult.swift", import.meta.url),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return ""
  throw error
})
const performanceScript = await readFile(
  new URL("../scripts/ios-performance", import.meta.url),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return ""
  throw error
})
const performanceReporterSource = await readFile(
  new URL("../scripts/ios-performance-report.mjs", import.meta.url),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return ""
  throw error
})
const cleanLaunchRunnerSource = await readFile(
  new URL("../scripts/ios-performance-clean-launch.mjs", import.meta.url),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return ""
  throw error
})
const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8")
const performanceReporter = await import(
  new URL("../scripts/ios-performance-report.mjs", import.meta.url)
).catch(() => null)
const remoteImageSource = await readFile(
  new URL("./FXRacing/DesignSystem/FXRemoteImage.swift", import.meta.url),
  "utf8",
)
const driverPickerSource = await readFile(
  new URL("./FXRacing/Features/Races/DriverPickerSheet.swift", import.meta.url),
  "utf8",
)
const raceDeckSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
)

function appConfig(name) {
  const match = projectYml.match(
    new RegExp(`^ {8}${name}:\\n(?:^ {10}.*\\n?)*`, "m"),
  )

  assert.ok(match, `${name} app configuration should exist`)
  return match[0]
}

function schemeConfig(name) {
  const match = projectYml.match(
    new RegExp(`^  ${name}:\\n(?:^ {4,}.*\\n?)*`, "m"),
  )

  assert.ok(match, `${name} scheme should exist`)
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

test("performance tests launch without debugger or runtime checker contamination", () => {
  const performanceSchemeConfig = schemeConfig("FXRacingPerformance")

  assert.match(
    performanceSchemeConfig,
    /test:[\s\S]*debugEnabled: false/,
  )
  assert.match(
    performanceSchemeConfig,
    /test:[\s\S]*disableMainThreadChecker: true/,
  )
  assert.match(
    performanceScheme,
    /<TestAction[\s\S]*selectedDebuggerIdentifier = ""/,
  )
  assert.match(
    performanceScheme,
    /<TestAction[\s\S]*selectedLauncherIdentifier = "Xcode\.IDEFoundation\.Launcher\.PosixSpawn"/,
  )
  assert.match(
    performanceScheme,
    /<TestAction[\s\S]*disableMainThreadChecker = "YES"/,
  )
  assert.match(
    performanceScript,
    /UITargetAppPerformanceAntipatternCheckerEnabled[\s\S]*-bool false/,
  )
  assert.match(
    performanceScript,
    /UITargetAppMainThreadCheckerEnabled[\s\S]*-bool false/,
  )
})

test("launch gates use normal simulator launches outside the UI-test runner", () => {
  assert.match(
    performanceScript,
    /shell\|cached-launch\|offline[\s\S]*ios-performance-clean-launch\.mjs/,
  )
  assert.ok(
    performanceScript.indexOf("ios-performance-clean-launch.mjs")
      < performanceScript.indexOf("xcodebuild -quiet \\\n  -xctestrun"),
    "clean launch scenarios must exit before XCUIApplication starts",
  )
  assert.match(cleanLaunchRunnerSource, /--terminate-running-process/)
  assert.match(cleanLaunchRunnerSource, /cache-prime/)
  assert.match(cleanLaunchRunnerSource, /get_app_container/)
  assert.match(cleanLaunchRunnerSource, /detail-c3Bh\.json/)
  assert.match(cleanLaunchRunnerSource, /log["',\s]+show/)
  assert.match(cleanLaunchRunnerSource, /--style["',\s]+json/)
})

test("the first shell frame avoids an unused navigation host", () => {
  const navigationStacks = shellSource.match(/NavigationStack\s*\{/g) ?? []

  assert.equal(
    navigationStacks.length,
    1,
    "only the profile sheet should own a NavigationStack",
  )
  assert.match(
    shellSource,
    /private var profileSheet:[\s\S]*NavigationStack\s*\{/,
  )
})

test("performance dependencies install a compile-time-only closed network boundary", () => {
  assert.match(performanceDependencies, /^#if FX_PERF_HARNESS/)
  assert.match(performanceDependencies, /DeterministicFailureURLProtocol\.install\(\)/)
  assert.match(deterministicProtocol, /^#if FX_PERF_HARNESS/)
  assert.match(deterministicProtocol, /URLProtocol\.registerClass\(Self\.self\)/)
  assert.match(deterministicProtocol, /override class func canInit[\s\S]*\{ true \}/)
  assert.match(deterministicProtocol, /URLError\(\.notConnectedToInternet\)/)
})

test("foreground refresh and shell hit targets do not wait on unrelated work", () => {
  const foregroundBlock = appSource.match(
    /\.onChange\(of: scenePhase\)[\s\S]*?\n                \}/,
  )?.[0]

  assert.ok(foregroundBlock, "scene foreground handler should exist")
  assert.match(foregroundBlock, /Task \{\s*await raceDeckViewModel\.handleForeground\(\)\s*\}/)
  assert.match(foregroundBlock, /Task \{[\s\S]*await authManager\.handleForeground/)
  assert.ok(
    foregroundBlock.indexOf("raceDeckViewModel.handleForeground") < foregroundBlock.indexOf("authManager.handleForeground"),
    "public race refresh should start independently without waiting for account restoration",
  )
  assert.match(shellSource, /\.frame\(minWidth: 44, minHeight: 44\)/)
  assert.match(shellSource, /\.frame\(minHeight: 44\)/)
  assert.doesNotMatch(shellSource, /\.frame\(width: 40, height: 40\)/)
  assert.doesNotMatch(shellSource, /\.frame\(height: 44\)/)
})

test("fixture-only performance tests cannot compile into the Debug test run", () => {
  const uiTestsTarget = projectYml.match(
    /^  FXRacingUITests:\n[\s\S]*?(?=^  [A-Za-z][^\n]*:\n|^schemes:)/m,
  )?.[0]

  assert.ok(uiTestsTarget, "FXRacingUITests target should exist")
  assert.match(
    uiTestsTarget,
    /Performance:\s*\n\s*SWIFT_ACTIVE_COMPILATION_CONDITIONS: FX_PERF_HARNESS/,
  )
  assert.match(performanceUITests, /^#if FX_PERF_HARNESS/)
  assert.match(performanceUITests, /final class FXRacingPerformanceTests: XCTestCase/)
  assert.doesNotMatch(performanceScheme, /FXRacingTests\.xctest/)
  assert.match(performanceScheme, /FXRacingUITests\.xctest/)
  assert.match(normalScheme, /FXRacingTests\.xctest/)
  assert.doesNotMatch(normalScheme, /FXRacingUITests\.xctest/)
  assert.doesNotMatch(appConfig("Debug"), /FX_PERF_HARNESS/)
  assert.doesNotMatch(appConfig("Release"), /FX_PERF_HARNESS/)
})

test("performance fixtures isolate empty cached offline and image scenarios", () => {
  for (const scenario of ["empty", "cachePrime", "cachedLaunch", "offline", "image"]) {
    assert.match(
      performanceFixtures,
      new RegExp(`case ${scenario}(?: =|\\n)`),
      `missing deterministic ${scenario} scenario`,
    )
  }
  assert.match(performanceDependencies, /PerformanceRaceRepository\(scenario: scenario\)/)
  assert.match(
    performanceDependencies,
    /RaceRepository\([\s\S]*cache: RaceSnapshotCache\(\)/,
    "cached launch must exercise production disk decoding",
  )
  assert.match(performanceUITests, /primeDiskCache/)
  assert.match(
    performanceUITests,
    /primeDiskCache[\s\S]*race-detail-ready-spa/,
    "cache priming must wait for the selected detail publication before terminating",
  )
  assert.doesNotMatch(
    performanceUITests.match(/primeDiskCache[\s\S]*?configuredApp/m)?.[0] ?? "",
    /pick-slot-spa-winner/,
    "a visible pick slot does not prove the detail cache write completed",
  )
  assert.match(
    raceDeckSource,
    /!detail\.entrants\.isEmpty[\s\S]*race-detail-ready-\\\(race\.id\)/,
    "the app must expose a readiness marker only after detail entrants publish",
  )
  const launchReadyApp = performanceUITests.match(
    /private func launchReadyApp[\s\S]*?(?=\n    @MainActor\n    private func)/,
  )?.[0] ?? ""
  assert.match(
    launchReadyApp,
    /pick-slot-spa-winner/,
    "interactive samples must wait for the driver-picker control",
  )
  assert.match(
    launchReadyApp,
    /throws -> XCUIApplication[\s\S]*for _ in 0\.\.\<2/,
    "interactive samples should retry one simulator launch before failing",
  )
  assert.doesNotMatch(
    launchReadyApp,
    /XCTAssertTrue/,
    "a failed readiness check must not continue with stale screen coordinates",
  )
  assert.match(
    performanceUITests,
    /waitUntilHittable[\s\S]*element\.exists && element\.isHittable && element\.isEnabled/,
    "hittable test controls must also be enabled before a measured gesture",
  )
  assert.match(performanceFixtures, /PerformanceImageDataLoader/)
  assert.match(performanceFixtures, /https:\/\/fixture\.invalid\/teams\//)
  assert.match(performanceFixtures, /makeLocalPickStore[\s\S]*removePersistentDomain/)
  assert.match(performanceFixtures, /makeTutorialStore[\s\S]*markAllSeen\(\)/)
  assert.match(
    appSource,
    /#if FX_PERF_HARNESS[\s\S]*PerformanceFixtureState\.makeLocalPickStore\(\)[\s\S]*#else[\s\S]*LocalPickStore\(\)[\s\S]*#endif/,
  )
  assert.match(
    appSource,
    /#if FX_PERF_HARNESS[\s\S]*PerformanceFixtureState\.makeTutorialStore\(\)[\s\S]*#else[\s\S]*TutorialStore\(\)[\s\S]*#endif/,
  )
  assert.ok(
    appSource.indexOf("PerformanceFixtureState.makeLocalPickStore()")
      < appSource.indexOf("GuestStore()"),
    "the performance domain must reset before guest/tutorial stores load",
  )
})

test("image performance waits for decoded fixture content instead of the picker shell", () => {
  assert.match(
    remoteImageSource,
    /loadedAccessibilityIdentifier:\s*String\?\s*=\s*nil/,
  )
  assert.match(
    remoteImageSource,
    /if let loadedAccessibilityIdentifier[\s\S]*accessibilityIdentifier\(loadedAccessibilityIdentifier\)/,
  )
  assert.match(
    driverPickerSource,
    /loadedAccessibilityIdentifier:\s*loadedImageAccessibilityIdentifier\(\s*for:\s*driver\s*\)/,
  )
  assert.match(
    driverPickerSource,
    /#if FX_PERF_HARNESS[\s\S]*"driver-image-\\\(driver\.id\)-loaded"[\s\S]*#else[\s\S]*nil[\s\S]*#endif/,
  )
  assert.match(
    performanceUITests,
    /waitUntil\(condition:\s*\{[\s\S]*element\("driver-image-gasly-loaded", in: app\)\.exists/,
  )
})

test("performance runner exports 3 warmups 30 raw samples and percentile gates", () => {
  assert.match(performanceUITests, /static let warmupCount = 3/)
  assert.match(performanceUITests, /static let sampleCount = 30/)
  assert.match(performanceUITests, /ContinuousClock\.now/)
  assert.match(performanceUITests, /waitUntilHittable/)
  assert.match(performanceUITests, /pager\.value as\? String == "Race 2 of 2"/)
  assert.match(performanceUITests, /race-detail-ready-monza/)
  assert.match(
    performanceUITests,
    /func testDriverSheetPerformance\(\) throws[\s\S]*?driver-gasly[\s\S]*?measure\([\s\S]*?driver-gasly/,
    "the full-field picker gate must wait for a driver in its initial viewport",
  )
  assert.match(performanceUITests, /timeout: TimeInterval = 10/)
  assert.match(performanceUITests, /XCTOSSignpostMetric/)
  assert.doesNotMatch(performanceUITests, /options\.iterationCount = 1/)
  assert.match(performanceUITests, /options\.iterationCount = resolvedSampleCount/)

  assert.match(performanceResult, /let samples: \[Double\]/)
  assert.match(performanceResult, /let p50: Double/)
  assert.match(performanceResult, /let p95: Double/)
  assert.match(performanceResult, /10\.0/)
  assert.match(performanceResult, /0\.8/)
  assert.match(performanceResult, /1\.0/)
  assert.match(performanceResult, /0\.6/)
  assert.match(performanceResult, /0\.5/)
  assert.match(performanceResult, /0\.2/)
  assert.match(performanceUITests, /enforced: Bool = false/)

  assert.match(performanceScript, /WARMUPS=3/)
  assert.match(performanceScript, /SAMPLES=30/)
  assert.match(performanceScript, /\.xcresult/)
  assert.match(performanceScript, /raw\.json/)
  assert.match(performanceScript, /\.xctestrun/)
  assert.match(performanceScript, /! -name '\*-run\.xctestrun'/)
  assert.match(
    performanceScript,
    /EnvironmentVariables\.FX_PERFORMANCE_WARMUPS/,
  )
  assert.match(
    performanceScript,
    /EnvironmentVariables\.FX_PERFORMANCE_SAMPLES/,
  )
  assert.match(performanceScript, /suggestedHumanReadableName/)
  assert.match(performanceScript, /includes\("-raw"\)/)
  assert.doesNotMatch(performanceScript, /endsWith\("-raw\.json"\)/)
  assert.match(performanceReporterSource, /p50/)
  assert.match(performanceReporterSource, /p95/)
  assert.match(performanceReporterSource, /threshold: 0\.8/)
  assert.match(performanceReporterSource, /threshold: 0\.3/)
  assert.match(performanceReporterSource, /threshold: 0\.5/)
  assert.match(performanceReporterSource, /threshold: 0\.1/)
  assert.match(performanceReporterSource, /threshold: 0\.2/)
  assert.match(gitignore, /^\/artifacts\/ios-performance\/$/m)
})

test("launch gates use app signposts instead of XCTest process-launch overhead", () => {
  assert.ok(performanceReporter, "the performance report merger should exist")

  const signposts = performanceReporter.extractSignpostResults([
    {
      testRuns: [
        {
          metrics: [
            {
              displayName: "Duration (LaunchToShell)",
              measurements: [0.75],
            },
            {
              displayName: "Duration (CachedListPublication)",
              measurements: [0.066],
            },
          ],
        },
      ],
    },
  ])

  assert.deepEqual(
    signposts.map(({ name, threshold, passed }) => ({ name, threshold, passed })),
    [
      { name: "launch-to-shell", threshold: 0.8, passed: true },
      { name: "cached-publication", threshold: 0.3, passed: true },
    ],
  )
  assert.match(performanceResult, /case "shell":\s*0\.8/)
  assert.match(performanceResult, /case "cached-launch", "offline-launch":\s*1\.0/)
  assert.match(performanceScript, /get test-results metrics/)
  assert.match(performanceScript, /ios-performance-report\.mjs/)
})

test("sheet and save gates use app signposts instead of synthetic tap overhead", () => {
  const signposts = performanceReporter.extractSignpostResults([
    {
      testRuns: [
        {
          metrics: [
            {
              displayName: "Duration (DriverPickerPresentation)",
              measurements: [0.31],
            },
            {
              displayName: "Duration (DriverPickerPreparation)",
              measurements: [0.08],
            },
            {
              displayName: "Duration (SchedulePresentation)",
              measurements: [0.28],
            },
            {
              displayName: "Duration (SaveCompletion)",
              measurements: [0.08],
            },
          ],
        },
      ],
    },
  ])

  assert.deepEqual(
    signposts.map(({ name, threshold, passed }) => ({ name, threshold, passed })),
    [
      { name: "driver-picker-presentation", threshold: 0.5, passed: true },
      { name: "driver-picker-preparation", threshold: 0.1, passed: true },
      { name: "schedule-presentation", threshold: 0.5, passed: true },
      { name: "save-completion", threshold: 0.2, passed: true },
    ],
  )
  assert.match(performanceUITests, /name: "DriverPickerPresentation"/)
  assert.match(performanceUITests, /name: "DriverPickerPreparation"/)
  assert.match(performanceUITests, /name: "SaveCompletion"/)
  assert.match(
    performanceUITests,
    /record\("driver-sheet", enforced: false\)/,
  )
  assert.match(
    performanceUITests,
    /record\("schedule-sheet", enforced: false\)/,
  )
  assert.match(
    performanceUITests,
    /record\("local-save", enforced: false\)/,
  )
  assert.match(
    performanceUITests,
    /testLocalSavePerformance\(\)[\s\S]*?launchReadyApp\(\.gameplay\)/,
    "local save must use the deterministic gameplay fixture without re-priming disk cache per sample",
  )
  assert.match(
    performanceUITests,
    /func testLocalSaveDiagnosticPerformance\(\) throws[\s\S]*?record\("local-save", enforced: false\)/,
    "local save wall time must be isolated from the app-owned signpost gate",
  )
  assert.match(
    performanceScript,
    /local-save\)[\s\S]*testLocalSaveDiagnosticPerformance[\s\S]*testLocalSavePerformance/,
    "the local-save scenario must run both exact-count test methods",
  )
  assert.match(performanceResult, /let enforced: Bool/)
  assert.equal(
    performanceReporter.reportPassed({
      results: [
        { passed: false, enforced: false },
        { passed: true, enforced: true },
      ],
    }),
    true,
    "synthetic interaction diagnostics must not fail app-owned signpost gates",
  )
  assert.equal(
    performanceReporter.reportPassed({
      results: [{ passed: false, enforced: true }],
    }),
    false,
  )
})

test("required signpost gates fail when metrics are missing or undersampled", () => {
  assert.deepEqual(
    performanceReporter.requiredSignpostNames("driver-sheet"),
    ["driver-picker-presentation", "driver-picker-preparation"],
  )

  const results = performanceReporter.extractSignpostResults(
    [
      {
        testRuns: [
          {
            metrics: [
              {
                displayName: "Duration (DriverPickerPresentation)",
                measurements: [0.2],
              },
            ],
          },
        ],
      },
    ],
    {
      requiredNames: performanceReporter.requiredSignpostNames("driver-sheet"),
      expectedSampleCount: 2,
    },
  )

  assert.deepEqual(
    results.map(({ name, passed, sampleCount, expectedSampleCount }) => ({
      name,
      passed,
      sampleCount,
      expectedSampleCount,
    })),
    [
      {
        name: "driver-picker-presentation",
        passed: false,
        sampleCount: 1,
        expectedSampleCount: 2,
      },
      {
        name: "driver-picker-preparation",
        passed: false,
        sampleCount: 0,
        expectedSampleCount: 2,
      },
    ],
  )
  assert.equal(performanceReporter.reportPassed({ results }), false)
  assert.match(performanceScript, /"\$SCENARIO" "\$SAMPLES"/)
  assert.deepEqual(
    performanceReporter.requiredSignpostNames("race-swipe"),
    ["race-selection-ready"],
  )
  assert.match(performanceUITests, /name: "RaceSelectionReady"/)
})
