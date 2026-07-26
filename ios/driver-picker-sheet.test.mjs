import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./FXRacing/Features/Races/DriverPickerSheet.swift", import.meta.url),
  "utf8",
);
const pickPanelSource = await readFile(
  new URL("./FXRacing/Features/Races/RacePickPanel.swift", import.meta.url),
  "utf8",
);
const raceDeckSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
);
const detailViewModelSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDetailViewModel.swift", import.meta.url),
  "utf8",
);
const performanceUITestSource = await readFile(
  new URL("./FXRacingUITests/FXRacingPerformanceTests.swift", import.meta.url),
  "utf8",
);

test("driver picker binds progressive state and keeps native sheet affordances", () => {
  assert.match(source, /@Binding\s+private var state:\s*DriverPickerState/);
  assert.match(source, /presentationDetents\(\[\.medium,\s*\.large\]\)/);
  assert.match(source, /presentationDragIndicator\(\.visible\)/);
});

test("driver picker exposes disabled reasons and advances accessibility focus", () => {
  assert.match(source, /unavailabilityReason\(for:\s*driver\)/);
  assert.match(source, /\.disabled\(!state\.isAvailable\(driver\)\)/);
  assert.match(source, /\.accessibilityHint\(/);
  assert.match(source, /@AccessibilityFocusState/);
  assert.match(source, /case slotHeading/);
  assert.match(source, /\.accessibilityAddTraits\(\.isHeader\)/);
  assert.match(source, /focusTarget\s*=\s*\.slotHeading/);
  assert.match(source, /AccessibilityNotification\.Announcement/);
  assert.match(source, /\.accessibilityIdentifier\("driver-\\\(driver\.id\)"\)/);
  assert.match(source, /\.contentShape\(Rectangle\(\)\)/);
});

test("picker consumes the atomic selection outcome and dismisses only after commit", () => {
  assert.match(source, /updatedState\.select\(driver\)/);
  assert.match(source, /private let onSelect:\s*\(Driver,\s*PickSlot\)\s*->\s*PickSelectionOutcome/);
  assert.match(source, /state\.apply\(updatedState,\s*outcome:\s*outcome\)/);
  assert.match(source, /case \.advance/);
  assert.match(source, /case \.dismiss/);
  assert.match(source, /case \.showError\(let message\)/);
  assert.match(source, /dismiss\(\)/);
  assert.match(source, /alert\(/);
  assert.match(source, /private let onRetryCommit:\s*\(\)\s*->\s*PickSelectionOutcome/);
  assert.match(source, /onRetryCommit\(\)/);
});

test("race deck synchronously commits then starts revision-safe sync in a Task", () => {
  assert.match(raceDeckSource, /detail\.selectAndCommit\(/);
  assert.match(raceDeckSource, /detail\.retryCurrentSelectionCommit\(/);
  assert.match(raceDeckSource, /case \.committed\(let ticket\)[\s\S]*Task\s*\{[\s\S]*detail\.syncCommittedPick\(/);
  assert.doesNotMatch(raceDeckSource, /onSave:/);
  assert.doesNotMatch(raceDeckSource, /onReviewDevicePicks:/);
  assert.doesNotMatch(pickPanelSource, /Review device picks|Save picks/);
});

test("local durability is the only success announcement and haptic boundary", () => {
  assert.match(source, /PickCommitFeedback\.publish\(for:/);
  assert.match(pickPanelSource, /PickCommitFeedback\.publish\(for:/);
  assert.doesNotMatch(detailViewModelSource, /Haptics\.success\(\)/);
});

test("rail retry commits the failed draft instead of opening a pick role", () => {
  assert.match(pickPanelSource, /case \.retry:[\s\S]*onRetryCommit\(\)/);
  assert.doesNotMatch(pickPanelSource, /case \.retry:[\s\S]*onSelectSlot\(\.dnf\)/);
});

test("local-save performance starts immediately before final selection", () => {
  const diagnostic = performanceUITestSource.match(
    /func testLocalSaveDiagnosticPerformance\(\) throws[\s\S]*?\n    }/,
  )?.[0] ?? "";
  assert.match(diagnostic, /let start = ContinuousClock\.now\s*finalDriver\.tap\(\)/);
  assert.match(performanceUITestSource, /prepareTwoPicks/);
  // Picks autosave, so the harness must never drive an explicit save control.
  // "Picks saved" is allowed: it is one of the status-rail titles the harness
  // waits on to observe that the autosave landed, not a button it taps.
  assert.doesNotMatch(performanceUITestSource, /save-picks-|Save picks|savePicksButton/);
});

test("the local-save harness waits on the status rail, not a fixed string", () => {
  // The rail collapses its children, so its text is the element label rather
  // than a static text, and the title varies with auth and sync state.
  assert.match(performanceUITestSource, /element\("race-pick-status", in: app\)/);
  assert.match(performanceUITestSource, /savedStatusTitles\.contains\(rail\.label\)/);
  assert.doesNotMatch(
    performanceUITestSource,
    /staticTexts\["Saved on this iPhone"\]/,
  );
});

test("pick rows stay visibly unavailable until driver data is ready", () => {
  assert.match(pickPanelSource, /private var isDriverSelectionReady:[\s\S]*!viewModel\.entrants\.isEmpty/);
  assert.match(pickPanelSource, /\.disabled\(isLocked \|\| !isDriverSelectionReady\)/);
  assert.match(pickPanelSource, /ProgressView\(\)[\s\S]*Drivers are loading/);
  assert.match(
    raceDeckSource,
    /guard[\s\S]*!detail\.entrants\.isEmpty[\s\S]*else \{[\s\S]*return[\s\S]*\}/,
  );
});

test("pick row chevrons use the full available row width", () => {
  assert.match(
    pickPanelSource,
    /driverIdentity\([\s\S]*Spacer\(minLength:\s*0\)[\s\S]*trailingIcon/,
  );
  assert.doesNotMatch(
    pickPanelSource,
    /\.fixedSize\(horizontal:\s*true,\s*vertical:\s*false\)/,
  );
});
