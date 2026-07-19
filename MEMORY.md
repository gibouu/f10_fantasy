# FX Racing release-polish handoff memory

Last updated: 2026-07-19

## Read this first

This file is the repo handoff for future agents or teammates continuing the FX Racing release-polish work.

Before changing code, read:

1. `MEMORY.md`
2. `.superpowers/sdd/progress.md`
3. `.superpowers/sdd/task-6a-verification-blocker.md`
4. `docs/superpowers/plans/2026-07-19-f10-ios-autosave-release-polish.md`

Worktree used for this branch:

```text
/Users/gibou/code/github/f10_fantasy/.worktrees/feat-367-ios-autosave-release-polish
```

Do not touch the dirty primary checkout:

```text
/Users/gibou/code/github/f10_fantasy
```

Current branch:

```text
feat/367-ios-autosave-release-polish
```

Task 6A implementation/fix HEAD before this handoff file:

```text
41ec84043b76cea3e7b1afe7c63d3816fabf09c8
```

Run `git rev-parse HEAD` for the latest handoff commit after this file is committed.

## GitHub issue order

Umbrella:

- #367 — Polish iOS autosave, driver form, stable cards, and release assets

Remaining child issues:

1. #368 — Verify Task 6A accessibility race card in Simulator
2. #369 — Complete Task 7 static landing cleanup and screenshot validator
3. #370 — Run Task 8 full verification and visual feedback loop
4. #372 — Prepare Task 9 release identifiers screenshots and landing assets
5. #371 — Complete Task 10 PR merge deployment upload and App Store submission

Recommended order:

1. Finish #368 first if CoreSimulator is healthy.
2. If simulator remains blocked, #369 is the only explicitly separable non-simulator preparation slice.
3. Do #370 after #368.
4. Do #372 after #370.
5. Do #371 last.

## Completed work on this branch

- Task 1: complete — season form/history contract.
- Task 2: complete — native driver form sheet.
- Task 3: complete — local-first autosave.
- Task 4: complete — pick status rail and save clarity.
- Task 5A: complete — legacy/device recovery foundation.
- Task 5B: complete — recovery safety hardening.
- Task 5C: complete — saved-pick integrity through metadata refresh.
- Task 6: complete — stable card geometry and Schedule centering.
- Task 6A: implemented and automated-test green, but not fully verified because simulator/manual verification remains blocked.

Latest Task 6A commits:

```text
62d36c5c959ccdd185115fa179e6be3877bd4570 Harden race card accessibility layout
41ec84043b76cea3e7b1afe7c63d3816fabf09c8 Fix accessibility race-card footer clipping
```

Task 6A automated verification already recorded:

```text
node --test ios/accessibility-race-card-layout.test.mjs  # 5/5 passed
npm run test:ios                                        # 113/113 passed
generic simulator build-for-testing                     # passed
xcodegen generate --spec ios/project.yml                # no project drift
git diff --check                                        # clean
```

## Current blocker

Task 6A is not fully verified.

Blocked checks:

- focused Task 6A UI regression
- broader `MainShellUITests`
- four-state manual inspection
- screenshots

Known CoreSimulator/simdiskimaged errors:

```text
CoreSimulatorService connection became invalid
simdiskimaged crashed or is not responding
Unable to locate device set
Connection refused
```

Known simulator device:

```text
9184C625-91BA-4DB0-B467-3D364F2554B5
```

Do not mark Task 6A fully verified until #368 is complete.

## Task 7 / release gate

Task 7 as a whole remains gated by Task 6A simulator verification.

The only approved independent slice is #369:

- landing-page strip removal
- static landing tests
- App Store screenshot validator script/tests
- ignored `.artifacts/app-store/` staging path

Do not treat this as release approval.

## Do not do until explicitly authorized

- Do not submit to App Store.
- Do not upload builds or screenshots.
- Do not change signing identities, certificates, or provisioning profiles.
- Do not accept Apple legal agreements for the owner.
- Do not expose Apple credentials, secrets, or 2FA.
- Do not delete simulator devices/runtimes/caches unless separately approved.
- Do not touch the primary checkout.

## Merge / PR guidance

This branch is feature work for #367 and is ahead of `origin/main`.

If handing off to another teammate:

1. Push the branch.
2. Open or update a draft PR against `main`.
3. Keep the PR blocked on #368 unless the owner explicitly accepts merging without final simulator verification.
4. Reference this file in the PR body.

Every commit and PR body must end with:

```text
— gib
```
