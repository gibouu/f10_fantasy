import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const iosRoot = fileURLToPath(new URL("./FXRacing", import.meta.url));

async function swiftSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return swiftSources(itemPath);
    return entry.isFile() && entry.name.endsWith(".swift") ? [itemPath] : [];
  }));
  return nested.flat();
}

async function source(relativePath) {
  return readFile(path.join(iosRoot, relativePath), "utf8");
}

test("remote images use one app-injected pipeline and no direct AsyncImage", async () => {
  const files = await swiftSources(iosRoot);
  const sources = await Promise.all(files.map(async (file) => ({
    file,
    contents: await readFile(file, "utf8"),
  })));
  const directUsers = sources
    .filter(({ contents }) => /\bAsyncImage\s*\(/.test(contents))
    .map(({ file }) => path.relative(iosRoot, file));

  assert.deepEqual(directUsers, []);

  const app = await source("FXRacingApp.swift");
  assert.match(app, /private let imagePipeline:\s*FXImagePipeline/);
  assert.match(app, /\.environment\(\\\.fxImagePipeline,\s*imagePipeline\)/);

  const remoteImage = await source("DesignSystem/FXRemoteImage.swift");
  assert.match(remoteImage, /@Environment\(\\\.fxImagePipeline\)/);
  assert.doesNotMatch(remoteImage, /var body[\s\S]*FXImagePipeline\s*\(/);
  assert.match(remoteImage, /Task\.isCancelled/);
});

test("glass is availability-gated and content cards stay opaque", async () => {
  const glass = await source("DesignSystem/FXGlassSurface.swift");
  assert.match(glass, /#available\(iOS 26\.0, \*\)/);
  assert.match(glass, /\.glassEffect\(/);
  assert.match(glass, /accessibilityReduceTransparency/);
  assert.match(glass, /\.thinMaterial/);
  assert.match(glass, /FXTheme\.Colors\.surfaceElevated/);
  assert.match(glass, /func fxGlassControl\(/);

  const theme = await source("DesignSystem/FXTheme.swift");
  const cardModifier = theme.match(/private struct FXCardSurfaceModifier[\s\S]*?\n}/)?.[0] ?? "";
  assert.doesNotMatch(cardModifier, /glass|Material/);
  assert.match(cardModifier, /FXTheme\.Colors\.surface/);
});

test("the compact profile control consumes the glass boundary", async () => {
  const shell = await source("Features/Home/MainShellView.swift");
  assert.match(shell, /profileButtonLabel[\s\S]*\.fxGlassControl\(radius:\s*22\)/);
  assert.doesNotMatch(shell, /profileButtonLabel[\s\S]*\.background\(\.thinMaterial,\s*in:\s*Circle\(\)\)/);
});

test("the fixed status rail replaces normal save and review controls", async () => {
  const picks = await source("Features/Races/RacePickPanel.swift");
  const rail = await source("Features/Races/RacePickStatusRail.swift");
  assert.match(picks, /RacePickStatusRail\(/);
  assert.doesNotMatch(picks, /Review device picks|Save picks|save-picks-/);
  assert.match(rail, /\.frame\([^)]*minHeight:\s*44/);
  assert.match(rail, /\.accessibilityValue\(/);
});

test("pager adjustment respects Reduce Motion", async () => {
  const pager = await source("Features/Races/CenteredRacePager.swift");
  assert.match(pager, /@Environment\(\\\.accessibilityReduceMotion\)/);
  assert.match(pager, /if reduceMotion\s*\{[\s\S]*selection\s*=\s*items\[nextIndex\]\.id/);
});

test("the race deck drives bounded active-race image prefetch", async () => {
  const deck = await source("Features/Races/RaceDeckView.swift");
  const model = await source("Features/Races/RaceDeckViewModel.swift");
  const pastCard = await source("Features/Races/PastRaceCard.swift");
  const qualifying = await source("Features/Races/QualifyingResultsView.swift");

  assert.match(deck, /@Environment\(\\\.fxImagePipeline\)/);
  assert.match(deck, /viewModel\.activeImagePrefetchRequests\(/);
  assert.match(deck, /imagePipeline\.replacePrefetchScope\(\s*with:\s*requests,\s*ownerID:/);
  assert.match(deck, /imagePrefetchOwnerID/);
  assert.match(deck, /clearPrefetchScope\(ownerID:/);
  assert.match(model, /activePrefetchIDs/);
  assert.match(deck, /viewModel\.imagePrefetchCohortKey/);
  assert.match(model, /entrant\.photoFullURL/);
  assert.match(model, /entrant\.constructor\.logoFullURL/);
  assert.match(model, /section == \.past \? 30 : 36/);
  assert.match(model, /let prefetchesTeamLogos = section == \.upcoming/);
  assert.match(pastCard, /DriverBubbleView\(driver:\s*driver,\s*size:\s*30\)/);
  assert.match(qualifying, /DriverBubbleView\(driver:\s*driver,\s*size:\s*30\)/);
});

test("a changed race cohort releases stale image prefetch before awaiting new details", async () => {
  const deck = await source("Features/Races/RaceDeckView.swift");
  const taskStart = deck.indexOf(".task(id: imagePrefetchTaskKey)");
  const taskEnd = deck.indexOf(".task(id: isShowingPicker)", taskStart);
  const task = deck.slice(taskStart, taskEnd);

  assert.notEqual(taskStart, -1);
  assert.notEqual(taskEnd, -1);
  assert.match(task, /let previousOwnerID = imagePrefetchOwnerID/);
  assert.match(task, /imagePrefetchOwnerID = nil/);
  assert.ok(
    task.indexOf("clearPrefetchScope(ownerID: previousOwnerID)")
      < task.indexOf("activeImagePrefetchRequests"),
    "the old owner must be cleared before detail-backed requests can suspend",
  );
});

test("race loading and tutorial motion honor accessibility settings", async () => {
  const skeleton = await source("DesignSystem/SkeletonView.swift");
  const deck = await source("Features/Races/RaceDeckView.swift");
  const leaderboard = await source("Features/Rankings/LeaderboardView.swift");

  assert.match(skeleton, /@Environment\(\\\.accessibilityReduceMotion\)/);
  assert.match(skeleton, /if reduceMotion\s*\{/);
  assert.match(skeleton, /Color\.secondary\.opacity\(0\.16\)/);

  for (const tutorialSource of [deck, leaderboard]) {
    assert.match(tutorialSource, /@Environment\(\\\.accessibilityReduceMotion\)/);
    assert.match(tutorialSource, /if reduceMotion\s*\{[\s\S]*hasSeen[A-Za-z]+\s*=\s*true/);
  }
});

test("race results expose picks without relying on color and allow names to grow", async () => {
  const results = await source("Features/Races/RaceResultsView.swift");
  const qualifying = await source("Features/Races/QualifyingResultsView.swift");
  const upcoming = await source("Features/Races/UpcomingRaceCard.swift");
  const past = await source("Features/Races/PastRaceCard.swift");

  assert.match(results, /Text\("Your pick"\)/);
  assert.match(results, /accessibilityLabel\("Your pick"\)/);
  assert.match(results, /accessibilityIdentifier\("your-pick-/);

  assert.doesNotMatch(results, /lineLimit\(1\)/);
  assert.doesNotMatch(qualifying, /lineLimit\(1\)/);
  assert.doesNotMatch(upcoming, /lineLimit\(1\)/);
  assert.doesNotMatch(past, /lineLimit\(1\)/);
});
