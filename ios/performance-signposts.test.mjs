import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const performanceSource = await readFile(
  new URL("./FXRacing/Core/Performance/FXPerformance.swift", import.meta.url),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return ""
  throw error
})
const appSource = await readFile(
  new URL("./FXRacing/FXRacingApp.swift", import.meta.url),
  "utf8",
)
const rootSource = await readFile(
  new URL("./FXRacing/RootView.swift", import.meta.url),
  "utf8",
)
const shellSource = await readFile(
  new URL("./FXRacing/Features/Home/MainShellView.swift", import.meta.url),
  "utf8",
)
const deckSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
)
const deckModelSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckViewModel.swift", import.meta.url),
  "utf8",
)
const detailModelSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDetailViewModel.swift", import.meta.url),
  "utf8",
)

test("native performance intervals use one points-of-interest signposter", () => {
  assert.match(performanceSource, /import os/)
  assert.match(
    performanceSource,
    /OSSignposter\(\s*subsystem: "com\.fxracing\.app",\s*category: \.pointsOfInterest\s*\)/s,
  )
  assert.match(performanceSource, /case launchToShell = "LaunchToShell"/)
  assert.match(
    performanceSource,
    /case launchDependencyAssembly = "LaunchDependencyAssembly"/,
  )
  assert.match(performanceSource, /case sectionSwitch = "SectionSwitch"/)
  assert.match(performanceSource, /case raceSelectionReady = "RaceSelectionReady"/)
  assert.match(
    performanceSource,
    /case selectedRaceDetailReady = "SelectedRaceDetailReady"/,
  )
  assert.match(
    performanceSource,
    /case driverPickerPresentation = "DriverPickerPresentation"/,
  )
  assert.match(
    performanceSource,
    /case driverPickerPreparation = "DriverPickerPreparation"/,
  )
  assert.match(performanceSource, /case saveCompletion = "SaveCompletion"/)
  assert.match(
    performanceSource,
    /case serverAcknowledgement = "ServerAcknowledgement"/,
  )
  assert.match(performanceSource, /case cachedListPublication = "CachedListPublication"/)
  assert.match(performanceSource, /case schedulePresentation = "SchedulePresentation"/)
  assert.match(performanceSource, /beginInterval\(/)
  assert.match(performanceSource, /endInterval\(/)
})

test("launch and section switches end only when their destination view appears", () => {
  assert.match(appSource, /FXPerformance\.begin\(\.launchToShell\)/)
  assert.match(
    appSource,
    /let dependencyAssemblyInterval = FXPerformance\.begin\(\.launchDependencyAssembly\)/,
  )
  assert.match(appSource, /dependencyAssemblyInterval\.end\(\)/)
  assert.match(appSource, /launchToShellInterval: launchToShellInterval/)
  assert.match(rootSource, /launchToShellInterval: launchToShellInterval/)
  assert.match(shellSource, /launchToShellInterval\.end\(\)/)
  assert.match(
    shellSource,
    /sectionSwitchInterval = FXPerformance\.begin\(\.sectionSwitch\)/,
  )
  assert.match(shellSource, /\.onAppear\s*\{\s*finishSectionSwitch\(\)\s*\}/)
})

test("race detail, picker, and save intervals cover their async UI boundaries", () => {
  assert.match(
    deckSource,
    /FXPerformance\.begin\(\.selectedRaceDetailReady\)/,
  )
  assert.match(deckSource, /defer\s*\{\s*detailReadyInterval\.end\(\)\s*\}/)
  assert.match(deckSource, /await detail\.loadIfNeeded\(/)
  assert.match(
    deckSource,
    /struct RaceSelectionPerformanceSpan[\s\S]*let token: UUID[\s\S]*let raceID: String[\s\S]*let interval: FXPerformanceSpan/,
  )
  assert.match(
    deckSource,
    /set:\s*\{\s*newID in\s*beginRaceSelection\(to: newID\)[\s\S]*selectedUpcomingID = newID/,
  )
  assert.match(
    deckSource,
    /selectionSpanToken[\s\S]*finishRaceSelection\(token: selectionSpanToken\)/,
  )
  assert.match(
    deckSource,
    /guard let token,[\s\S]*raceSelectionReadySpan\?\.token == token[\s\S]*interval\.end\(\)/,
  )
  assert.doesNotMatch(
    deckSource,
    /\.onChange\(of: selectedRaceID\)[\s\S]*FXPerformance\.begin\(\.raceSelectionReady\)/,
  )
  assert.match(
    deckSource,
    /pickerPresentationInterval = FXPerformance\.begin\(\.driverPickerPresentation\)/,
  )
  assert.match(
    deckSource,
    /let pickerPreparationInterval = FXPerformance\.begin\(\.driverPickerPreparation\)/,
  )
  assert.match(deckSource, /\.onAppear\s*\{\s*finishPickerPresentation\(\)\s*\}/)
  assert.match(
    deckSource,
    /let isFinalSelection[\s\S]*?FXPerformance\.begin\(\.saveCompletion\)[\s\S]*?detail\.selectAndCommit\([\s\S]*?guard case \.committed[\s\S]*?saveCompletionInterval\?\.end\(\)/,
  )
  assert.match(
    detailModelSource,
    /let serverAcknowledgementInterval = FXPerformance\.begin\(\.serverAcknowledgement\)[\s\S]*?await syncManager\.submitExplicit\([\s\S]*?serverAcknowledgementInterval\.end\(\)/,
  )
})

test("cached publication and schedule presentation expose internal milestones", () => {
  assert.match(
    deckModelSource,
    /FXPerformance\.begin\(\.cachedListPublication\)[\s\S]*?await repository\.cachedList\(\)/,
  )
  assert.match(
    deckModelSource,
    /publish\(cached\)[\s\S]*?cachedPublicationInterval\.end\(\)/,
  )
  assert.match(
    deckSource,
    /schedulePresentationInterval = FXPerformance\.begin\(\.schedulePresentation\)/,
  )
  assert.match(
    deckSource,
    /RaceScheduleSheet\(race: race\)[\s\S]*?finishSchedulePresentation\(\)/,
  )
})
