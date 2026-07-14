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

test("progressive selection updates state without dismissing the primary flow", () => {
  assert.match(source, /updatedState\.select\(driver\)/);
  assert.match(source, /guard\s+onSelect\(driver,\s*selectedSlot\)\s+else/);
  assert.match(source, /state\s*=\s*updatedState/);
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
