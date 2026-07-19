import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const racePickStatusRail = await readFile(
  new URL("./FXRacing/Features/Races/RacePickStatusRail.swift", import.meta.url),
  "utf8",
);
const pastRaceCard = await readFile(
  new URL("./FXRacing/Features/Races/PastRaceCard.swift", import.meta.url),
  "utf8",
);
const pickService = await readFile(
  new URL("../src/lib/services/pick.service.ts", import.meta.url),
  "utf8",
);

test("account-acknowledged picks use clear durable saved copy", () => {
  const confirmedBlock = racePickStatusRail.match(
    /if isCurrentRevisionConfirmed\(context\) \{[\s\S]*?\n        \}/,
  )?.[0];

  assert.ok(confirmedBlock, "confirmed account-save status block should exist");
  assert.match(
    confirmedBlock,
    /"Picks saved"/,
    "server-acknowledged current revisions should use user-facing 'Picks saved' copy",
  );
});

test("failed or unacknowledged saves cannot use durable saved copy", () => {
  const unacknowledgedStates = [
    /submissionState == \.savingLocally[\s\S]*?status\("Saving\.\.\."/,
    /didLocalWriteFail[\s\S]*?"Couldn't save on this iPhone"/,
    /syncIssue == \.offline[\s\S]*?"Saved on this iPhone"/,
    /syncIssue == \.unauthorized[\s\S]*?"Saved on this iPhone"/,
  ];

  for (const pattern of unacknowledgedStates) {
    const block = racePickStatusRail.match(pattern)?.[0];
    assert.ok(block, `expected state block for ${pattern}`);
    assert.doesNotMatch(
      block,
      /"Picks saved"/,
      "only server-acknowledged current revisions may claim picks are saved",
    );
  }
});

test("locked official picks do not render unresolved metadata as no pick", () => {
  assert.doesNotMatch(
    pastRaceCard,
    /\?\? "No pick"/,
    "a saved pick with unresolved display metadata must show a recoverable saved-pick fallback, not 'No pick'",
  );
});

test("private pick fetch resolves persisted seat identity against current entrants", () => {
  const getPickForRaceBlock = pickService.match(
    /export async function getPickForRace[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(getPickForRaceBlock, "getPickForRace should exist");
  assert.match(
    pickService,
    /resolvePickAgainstEntrants/,
    "the pick service should import/use the same seat-aware pick resolver as other pick display paths",
  );
  assert.match(
    getPickForRaceBlock,
    /resolvePickAgainstEntrants/,
    "GET /api/picks should return saved picks resolved against the current race entrants",
  );
});
