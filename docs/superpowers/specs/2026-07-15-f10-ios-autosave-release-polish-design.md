# F10 iOS Autosave and Release Polish Design

**Date:** 2026-07-15

**Issue:** [#367](https://github.com/gibouu/f10_fantasy/issues/367)

**Status:** Approved direction; implementation pending

**Owner:** gib

## Goal

Make the existing three-pick F10 game feel immediate, stable, and native to modern iOS without changing its rules. Completing P1, P10, and DNF should be enough: the app saves safely, confirms the result in plain language, keeps swiped race cards visually stable, and lets a player inspect the race-by-race results behind each season average.

This pass also corrects the Schedule sheet presentation, removes the repetitive scoring strip from the static website, and produces final native screenshots suitable for both the landing page and App Store Connect.

## Approved Product Boundary

### In scope

- Local-first autosave after the third unique pick and after every later edit to a complete set.
- Background account sync through the existing revisioned outbox and session-scoped authority model.
- A fixed-height, plain-language status region in place of the normal full-width Save button.
- A one-time, explicit recovery sheet for ambiguous picks created by older app versions.
- Stable upcoming-card geometry while swiping and hydrating.
- A native driver-form sheet opened from a Season form row.
- Compact prior-race result rows added to the existing cached race-detail entrant payload.
- A visually centered, opaque Schedule sheet.
- Removal of the redundant website P1/P10/DNF scoring strip.
- Fresh screenshot capture, validation, landing asset refresh, and App Store Connect handoff.
- Preservation and extension of the coordinate-pinned localhost annotation companion.

### Rules that do not change

- A valid pick set contains exactly three distinct drivers: P1, P10, and DNF.
- The lock cutoff and all server-side lock enforcement remain authoritative.
- Early-bird/qualifying bonus eligibility and scoring formulas remain unchanged.
- Rankings, official scoring, guest behavior, authentication, and account ownership semantics remain unchanged.
- Upcoming and Past remain swipeable race decks inside the existing persistent shell.

### Non-goals

- No database schema change.
- No new gameplay, pick category, scoring rule, fantasy currency, or social feature.
- No career-wide or cross-season driver profile in this pass.
- No change to the definition of AVG: classified finishes only, from completed earlier races in the same season and race type.
- No replacement for cross-device conditional-write support tracked in #362.
- No broad public-API latency project beyond preventing regressions; #361 remains separate.
- No restoration of the retired browser game.
- No automatic App Store submission without an authenticated owner checkpoint.

## Confirmed Current State and Root Causes

- `Review device picks` is a conditional full-width control directly above `Save picks` inside `RacePickPanel`. It is not App Review. It recovers a legacy local record whose account owner cannot be proven.
- Selecting a driver currently changes only the in-memory draft. `submit()` performs the first durable local write, so a player must press Save.
- Save confirmation exists only as a temporary button-label change and haptic; authenticated sync can move through that state too quickly to notice.
- Upcoming cards have minimum heights, not equal heights. Conditional recovery, save, sign-in, error, and hydration blocks therefore change each card's intrinsic height.
- The selected card is mathematically centered, but the visible neighboring-card sliver creates an optical right bias on the first card.
- Season form exposes only aggregate AVG/DNF values and its rows are not interactive.
- The server already reads the prior `RaceResult` rows needed for season form. No schema change is required.
- The Schedule sheet uses `ultraThinMaterial`, allowing the underlying race page to bleed through. Its intrinsically sized leading header also creates visual imbalance.
- The website hero already explains P1/P10/DNF. The separate lower scoring strip repeats the same information.
- Existing website screenshots are 736 x 1600 and are not valid top-tier App Store screenshot assets.

## Design Direction

### Subject and audience

F10 is a race-weekend prediction utility for Formula 1 fans who should be able to make three calls in seconds. Its visual language should feel like a compact race-control surface: fast to scan, quiet when settled, and explicit only when action is required.

### Visual tokens

- **Track Black** `#050505`: app canvas.
- **Carbon** `#1C1C1E`: primary content card.
- **Elevated Graphite** `#2C2C2E`: native sheet and secondary surface.
- **Signal Red** `#FF2D2D`: F10 identity, active pick emphasis, and urgent lock state.
- **Pit White** `#F5F5F7`: primary text.
- **Muted Silver** `#8E8E93`: secondary text and passive metadata.

Use semantic system colors where accessibility or contrast adaptation is required; the named values define the intended dark appearance.

### Typography

- SF Pro Display, semibold: race names and section titles.
- SF Pro Text, regular/medium: picks, driver names, and explanatory copy.
- SF Mono or `monospacedDigit()`: round number, countdown, placement, AVG, and DNF data.

### Signature element

The one distinctive element is the **race-control status rail** below the three picks. It occupies one predictable slot and combines persistence state with bonus eligibility. It replaces stacked implementation controls with one calm answer to the player's actual question: “Are my picks saved?”

Liquid Glass remains reserved for controls and presentation chrome. Opaque content cards remain the readability anchor.

## Pick Experience

### Normal flow

1. The player opens a role row and chooses a driver.
2. The picker advances P1 -> P10 -> DNF as it does today.
3. Choosing the third unique driver starts a durable local save immediately and dismisses the picker.
4. A signed-in player syncs in the background. A guest remains safely saved on the iPhone.
5. Reopening any role and choosing a different driver creates a new local revision and autosaves again.

No normal flow contains a `Save picks` button.

### Autosave boundary

- Incomplete drafts remain in memory and are not promoted into the existing complete `PickSelection` storage model.
- Autosave begins only when all three IDs are present and distinct.
- A complete selection uses a two-phase commit boundary. On `MainActor`, the view model revalidates the race lock and current owner scope, then performs the synchronous `LocalPickStore` write and receives its record ID and monotonic revision.
- The picker dismisses and a success checkmark appears only after that local commit succeeds. A fire-and-forget `Task` is never the first durable-write boundary.
- Only after local success does asynchronous work start or join `SyncManager`. Only an acknowledgement for the captured owner, race, session lease, and exact revision may become authoritative.
- Rapid edits may coalesce remote work, but they never delay or skip the local write.
- App backgrounding, process termination, or network loss after local save leaves a queued revision that can resume later.
- Complete edits are serialized on `MainActor`, so two quick choices create ordered local revisions even if the older POST finishes last.
- An account/scope change before commit aborts the commit and reloads the correct scope. A change after commit leaves the record under its captured owner and invalidates that scope's old sync lease.
- A local persistence failure keeps the picker visible, shows `Couldn't save on this iPhone`, and offers `Try again`; it must not haptically or visually claim success.
- Lock and server-authority checks remain unchanged. Autosave is a trigger change, not a weakening of validation.

### Status rail

The rail always reserves the same layout slot. It may adapt from one line to two at accessibility Dynamic Type sizes, but a state change cannot insert a new full-width control.

State precedence is: locked or authority conflict, local-write failure, local write in progress, current-revision account acknowledgement, queued/syncing local revision, guest local revision, incomplete draft. An older network response cannot displace a newer state.

| State | Primary copy | Secondary/action |
|---|---|---|
| Incomplete | `Choose 2 more` / `Choose 1 more` | `Finish before qualifying for 2×` |
| Local write in progress | `Saving...` | spinner, no blocking overlay |
| Local write failed | `Couldn't save on this iPhone` | `Try again` |
| Signed-in and confirmed | `Saved to account` | bonus state derived from authoritative server fields |
| Signed-in, queued/syncing | `Saved on this iPhone` | `Sync before qualifying for 2×` |
| Offline/retryable failure | `Saved on this iPhone` | `Will sync when online`; never claim the bonus is secured |
| Guest | `Saved on this iPhone` | compact `Sign in` action and no bonus claim until account sync |
| 401/session expired | `Saved on this iPhone` | `Sign in again to sync` |
| 423/locked | `Race locked` | `Latest changes weren't submitted` when the current revision was rejected |
| Actionable authority conflict | `Account picks need attention` | opens a dedicated resolution sheet |

Use a checkmark only after the local write succeeds. Announce the first successful save through VoiceOver and a success haptic. Do not repeatedly announce routine background acknowledgements.

### Bonus copy

The current large red `Save before qualifying for 2× points` line is folded into the status rail. Before completion it is guidance. Extend the decoded server pick with optional `updatedAt` and `lockedSubmittedBeforeQualifying`, fields already present in the API data shape, so bonus copy is based on server authority rather than local clock alone:

- `updatedAt < qualifyingStartUtc` on the acknowledged current revision: `2× bonus eligible`.
- `lockedSubmittedBeforeQualifying == true`: `2× bonus secured`.
- equality at the cutoff is not eligible, matching the server's strict comparison.
- queued, guest, offline, unknown, or delayed responses never claim eligibility; use `Sync before qualifying for 2×` while the cutoff remains in the future.
- after the cutoff, omit promotional copy unless the server has positively reported eligibility/lock state.

The bonus copy no longer consumes a separate variable-height block.

## Legacy Pick Recovery

### Meaning

The old v1 device record does not contain an owner. Silently uploading it could bind picks made under a different account on the same iPhone. That safety boundary must remain explicit.

### Presentation

- Remove the `Review device picks` control from the race card entirely.
- Present at most once per race + current owner scope + app session after driver data is available. Changing account scope dismisses the sheet and invalidates that presentation decision.
- The native sheet is titled `Picks found on this iPhone`.
- Signed-in copy: `These picks were saved by an older version of F10. Choose whether to use them with this account.` Guest copy: `These picks were saved by an older version of F10. Choose whether to keep them on this iPhone.`
- Show the recovered P1, P10, and DNF names.
- Dismissing the sheet is equivalent to `Not now`: do not upload, do not delete, and do not repeatedly present again during the same app session.

### Conflict safety

- A signed-in `Use`/`Replace` action remains disabled until the private pick lookup for the same captured session lease resolves. Entrant/public-detail readiness alone is not sufficient authority.
- If that lookup is pending or unavailable, show `Checking account picks...` or `Connect to check account picks`, with Retry and Not now. Never adopt into an account while authority is unknown.
- Revalidate the current user ID, session lease, lock, destination record, and server-pick result at action time. An account change while the sheet is open cancels the action.
- Add revision-checked atomic store operations for adopt, discard, and conflict resolution. The ambiguous source record is removed only after the destination write persists and reads back successfully; a failure leaves the source recoverable.
- Guest with no destination record: `Use on this iPhone`, `Discard`, or `Not now`. Use adopts into `.guest` and never starts account sync.
- Signed-in with a resolved empty account/destination: `Use these picks`, `Discard`, or `Not now`. Use creates an owner-scoped local revision and enters normal autosave/sync.
- Signed-in with current local or server picks: show both triplets. Safe default `Keep current picks` deletes only the ambiguous record; `Replace with found picks` requires explicit confirmation before creating a newer owner revision.
- Locked race: Use/Replace is disabled. The player may view, Discard, or choose Not now.
- `Discard` and `Keep current picks` permanently resolve only the ambiguous legacy record. `Not now` preserves it for a later app session.
- No recovery state changes the card's height.

## Stable and Centered Race Deck

### Card structure

Every upcoming card has the same vertical regions:

```text
round + Schedule
race identity + countdown
divider
Your picks + three role rows
race-control status rail
```

- Remove conditional recovery/save/sign-in button stacks.
- The status rail always reserves a two-line slot, even when current copy fits on one line.
- Define one deterministic `UpcomingCardLayoutMetrics` table for each Dynamic Type class before the deck becomes interactive. It reserves the maximum supported line counts for race title, circuit, three pick rows, bonus/status copy, and standard padding through scaled font line heights.
- Placeholder and hydrated cards consume those identical regions. Production copy is bounded to the specified line counts; detailed errors remain outside the card.
- The resulting class-specific maximum floor is applied to every upcoming card from the first frame. It is not learned from later hydration and cannot grow while the player remains in the section.
- A content-size-category change rebuilds the deck with the new precomputed common floor. Accessibility classes receive their own larger floor and outer-page vertical scrolling, so text grows without per-card clipping or a swipe-time height change.
- Fixture geometry tests cover the longest race, circuit, driver, and status strings at every supported Dynamic Type class. Any overflow is a release failure, not a reason to grow one card dynamically.
- Error detail belongs in a toast, alert, or resolution sheet, not as an unbounded paragraph that stretches one race card.
- Hydration replaces placeholder content inside the same reserved regions.

### Pager alignment

- Keep equal 18-point leading and trailing gutters for the selected card.
- For the iPhone target, use 18-point inter-card spacing to match the 18-point side inset, making `adjacentPeek == 0` instead of exposing an asymmetric eight-point sliver on the first page.
- The max-width compatibility layout may show multiple complete cards on a wider viewport, but must not show a clipped sliver as if the selected iPhone card were off-center.
- Preserve horizontal drag, snapping, VoiceOver adjustable actions, and reduced-motion behavior.
- Verify first, middle, and last pages on the user's physical device in addition to geometry tests.

## Driver Form Sheet

### Entry point

Each row in `Season form` becomes a full-width button. Driver rows inside the pick-selection sheet retain their existing selection behavior and do not open history.

Because the existing `seasonDnfCount` includes every non-classified result, change the compact column label from misleading `DNF` to `OUT`; its accessibility label is `non-classified results`. This is display accuracy only and does not alter scoring or the underlying count.

### Content

The native swipe-down sheet contains:

- Driver name and team.
- `AVG 4.3` and `OUT 3`; `OUT` is defined accessibly as all non-classified DNF, DNS, or DSQ rows.
- Context label adapts to race type: `Race results before Belgium` for MAIN or `Sprint results before Belgium` for SPRINT.
- A newest-first scrollable list with race name on the left and result on the right.
- Result labels: classified `P<n>`; otherwise `DNF`, `DNS`, or `DSQ` exactly.
- Empty state adapts to type: `No completed races yet.` or `No completed sprints yet.`
- Short explanatory note: `AVG uses classified finishes.`

Example:

```text
Lando Norris             AVG 4.3 · OUT 3
Race results before Belgium

British Grand Prix                    P5
Austrian Grand Prix                  DNF
Canadian Grand Prix                   P5
Spanish Grand Prix                    P2
...
```

### Data contract

Replace the current two aggregate `groupBy` operations with one projected prior-result query. Define a shared service result rather than calculating aggregate and history through separate cohorts:

```text
DriverSeasonForm = {
  averageFinish?: number,
  nonClassifiedCount: number,
  results: DriverSeasonResult[]
}

DriverSeasonResult = {
  driverId,
  raceId,
  raceName,
  scheduledStartUtc,
  position?,
  status
}
```

Extend the existing race-detail entrant shape with the optional compact `seasonResults` rows:

```text
seasonResults?: [
  raceId,
  raceName,
  scheduledStartUtc,
  position?,
  status
]
```

- The single query projects driver ID, race ID/name/start, position, and status for completed races in the same season and race type, strictly earlier than the selected race. Aggregate AVG/OUT and history are computed from that exact row set.
- Keep non-classified rows in history; exclude them from AVG exactly as today.
- Sort newest first on the server and preserve that order in Swift.
- Add the field as optional so older cached JSON snapshots still decode.
- Do not add a new database table, N per-race requests, or a driver-history waterfall.
- Service/route tests assert one prior-result query and no serial per-driver calls.
- Add a worst-case 22-entrant x 24-prior-race response/decode fixture. Its uncompressed race-detail JSON must remain at or below 128 KiB and the existing detail-readiness p95 gate must remain green.

This cached-payload approach is preferred over a tap-time endpoint because the row opens instantly and remains useful offline. If measured payload/decode performance breaches the existing gate, the implementation must stop and re-plan around a dedicated cached endpoint rather than relaxing the gate.

## Schedule Sheet

- Retain a native swipe-down sheet with medium and large detents and the standard drag indicator.
- Replace the ultra-thin presentation background with an opaque dark system surface.
- Dimmed content may remain visible above a medium native sheet; content must not bleed through the sheet itself.
- Center the title independently of the flag or remove the flag from the title row.
- Place all content inside a centered max-width container with equal horizontal margins.
- Keep schedule rows aligned and readable at accessibility sizes.
- Verify the sheet's visual centerline on the target physical iPhone, not only in source tests.

## Website Simplification

- Remove the entire `landing-rules` section from the home page.
- Remove P1/P10/DNF definition tiles and `Make all three calls before qualifying for bonus points.`
- Delete the now-unused scoring-section CSS and related assertions.
- Keep the hero explanation unchanged so the landing page still communicates the game once.
- Keep `/`, `/privacy`, and `/support` static and preserve every API/Auth/backend route used by iOS.
- The footer should follow the hero directly.

## Screenshot and App Store Handoff

### Capture set

Capture clean native images after final device verification:

1. `01-upcoming-autosave.png`: upcoming race with three completed picks and `Saved to account` status.
2. `02-driver-picker.png`: full driver picker showing the active field.
3. `03-driver-form.png`: driver form sheet showing mixed Pn and DNF results.
4. `04-past-scoring.png`: past-race scoring/result view.
5. `05-rankings.png`: rankings view.

Do not expose performance-fixture labels, diagnostics, recovery prompts, developer controls, or placeholder data in marketing captures.

Use deterministic public race data and synthetic user/ranking identities. Do not capture an email address, token, private username, notification, or real account metadata. Driver/team marketing assets may be used only under the permissions already confirmed by the owner.

The landing page uses optimized derivatives of `01-upcoming-autosave.png` and `02-driver-picker.png`; the remaining three images are App Store/review assets and companion screens.

### Dimensions and validation

- Prefer the connected physical large-screen iPhone to avoid installing another Simulator runtime on the user's storage-constrained Mac.
- At capture time, re-check Apple's current screenshot specification rather than assuming dimensions.
- Export accepted portrait PNG/JPG files with no alpha and validate exact pixel dimensions before upload.
- Derive optimized landing JPGs from the native high-resolution masters; never upscale the current 736 x 1600 website images for App Store use.
- Use ignored `.artifacts/app-store/<version>-<build>/iphone-6.9/` only as worktree-local staging.
- Before merge or worktree cleanup, copy the unedited masters and manifest to the owner-controlled durable directory `/Users/gibou/Documents/F10 Releases/<version>-<build>/app-store/iphone-6.9/`, verify every SHA-256 against the staging manifest, and never remove that durable copy as part of repository cleanup.
- After durable verification, the duplicate worktree staging copy may be removed to conserve disk space.
- Store landing derivatives as `public/landing/fx-racing-race-deck-v2.jpg` and `public/landing/fx-racing-driver-picker-v2.jpg`.
- Generate `.artifacts/app-store/<version>-<build>/manifest.json` containing filename, pixel dimensions, color mode/alpha result, byte size, SHA-256, capture device, source screen ID, and validation status.

### App Store Connect boundary

- First verify whether version 1.7.1 remains editable and query the next unused build number; do not assume build 45.
- Archive and validate the Release build with the existing automatic signing configuration.
- If an authenticated App Store Connect session/API credential is available, upload screenshots and select the processed build only at the authorized release checkpoint.
- Stop before final `Submit for Review` unless the owner explicitly confirms that external action.
- Always create `docs/release/app-store/<version>-<build>-handoff.md`, even when upload automation succeeds. Record the verified version/build, expanded durable master directory, manifest hash verification, validation result, build-processing state, screenshot-upload state, remaining metadata/review steps, blockers, and exact current App Store Connect checklist.

## Local Visual Feedback Companion

- Reuse the existing localhost companion and preserve its prior screens and notes.
- Canonical screen IDs are `native/upcoming-autosave`, `native/driver-picker`, `native/driver-form`, `native/schedule`, `native/past-scoring`, `native/rankings`, and `web/landing`.
- Right-clicking records page-relative coordinates plus a stable route and element identifier.
- Save notes immediately, retain import/export, and never clear old notes while refreshing images.
- Before a refresh, export the note JSON and record its note count plus SHA-256. After reload/import, assert the same existing note IDs and count remain before accepting new screenshots.
- Reopen the companion after each visual revision.
- Native Simulator and physical-device behavior remain the source of truth; the companion is the annotation surface.

## Performance Design

- Autosave local persistence must remain within the existing local-save p95 gate of 0.200 seconds.
- Picker preparation remains below 0.100 seconds p95 and native presentation below 0.500 seconds p95.
- Race selection/detail readiness remains below the existing 0.600 seconds p95 gate.
- Cached/offline launch gates remain unchanged.
- Local persistence occurs before remote sync and never waits for account/network work.
- Remote autosave work uses the existing serialized, revision-safe `SyncManager`; no parallel per-tap POST fan-out.
- Driver history must not create an N-request waterfall, eager image work, or unbounded race prefetch.
- Season form/history remains image-free unless an already cached local driver image can be used without starting new work.
- Website removal must not add client JavaScript or runtime rendering.

Performance thresholds may not be relaxed to accommodate this feature. If a gate fails, identify and fix the regression or re-plan the data path.

## Accessibility

- Pick rows, status rail actions, Season form rows, recovery actions, and Schedule controls retain at least 44 x 44 point hit targets.
- The status rail never relies on color alone and has a complete VoiceOver value.
- Announce successful local save once; expose sync/offline state without repeated interruptions.
- Driver history reads each row as race name plus placement/status.
- Preserve Dynamic Type without fixed-height clipping.
- Preserve Reduce Motion for pager settling and sheet-related custom animation.
- Recovery and conflict copy uses player language, never storage terms such as device revision, owner scope, or legacy ambiguity.

## Testing Strategy

### Test-driven native behavior

- Incomplete selections do not persist.
- The third unique selection creates one durable local revision without a Save tap.
- Editing a complete set creates a newer revision.
- Rapid complete edits cannot let an older acknowledgement replace the newest revision.
- Guest, authenticated, offline, retry, 401, and 423 outcomes map to the intended status copy.
- Ambiguous legacy picks never upload before explicit `Use these picks`.
- Recovery tests cover slow/unavailable private lookup, account switch while open, guest use, destination occupied, locked race, atomic persistence rollback, Replace, Discard, Keep current, and Not now.
- Server `updatedAt` exactly equal to qualifying is not bonus-eligible; delayed/offline acknowledgement never produces a false bonus claim.
- Complete local commit survives immediate backgrounding/cancellation; local failure leaves the picker open and never announces success.
- The picker dismisses after the final initial selection and after a completed-set replacement.

### API and decoding

- Mixed CLASSIFIED/DNF/DNS/DSQ rows preserve result semantics and newest-first order.
- History and aggregate values use the same season/type/time cohort.
- Race detail exposes optional compact history without serial query waterfalls.
- Swift decodes both new responses and older cached responses with no `seasonResults` field.
- Payload size and existing detail readiness are measured before acceptance.

### UI and geometry

- No normal race card contains `Review device picks` or `Save picks`.
- Status copy is durable and accessible after autosave.
- Adjacent upcoming cards report equivalent standard-size frames before and after placeholder hydration and conflict/recovery states.
- Season form opens and dismisses the correct driver sheet.
- Schedule uses equal margins and an opaque surface.
- Pure geometry tests assert zero iPhone adjacent peek with 18-point spacing/insets; XCUITest compares first, middle, and last card frames.
- Run one focused UI geometry path at an accessibility content-size category to prove the common-height policy grows without clipping.

### Website and release assets

- Page tests assert the redundant rules strip and repeated sentence are absent.
- Static landing, privacy, support, redirect, and API-preservation checks remain green.
- Screenshot validation rejects alpha or unsupported dimensions.
- The annotation companion retains prior notes after new screens are added.

### Full verification

- Focused red/green tests for every behavior change.
- `npm run test:ios`
- `npm run test:services`
- `npm run test:routes`
- `npm run test:pages`
- `npm run test:components`
- `npm run test:scripts:static`
- `npx tsc --noEmit`
- ESLint through the repository-supported path.
- Production Next.js build.
- Generic iOS Simulator build-for-testing.
- Full native XCTest suite and focused UI tests.
- Existing performance harness for picker, race selection, local save, cached launch, offline launch, and Schedule.
- Physical-device review of centering, autosave confirmation, driver form, Schedule, and swipe smoothness.
- `git diff --check` and secret scan before commit/PR.

## Delivery Sequence

1. Add failing tests for autosave, recovery safety, and stable status semantics.
2. Implement local-first autosave and replace the stacked card actions with the status rail.
3. Add recovery-sheet behavior and legacy discard support.
4. Add failing server/decoding tests and compact season-result history.
5. Implement the native driver-form sheet.
6. Stabilize card regions and pager optical centering.
7. Correct Schedule presentation and centering.
8. Remove the website scoring strip and unused styles.
9. Run focused and full verification, then the performance gates.
10. Install on Simulator and the connected physical iPhone; review through the preserved annotation companion.
11. Capture/validate final screenshots and refresh landing assets.
12. Open a signed PR with `Closes #367`, self-review it in GitHub, merge only after user visual approval, then prepare the App Store Connect release checkpoint.

## Success Criteria

- A new player makes three picks and receives unmistakable confirmation without pressing Save.
- A returning player edits one pick and sees the latest revision survive rapid interaction, relaunch, and weak connectivity.
- An old ambiguous device record can never silently attach to the wrong account.
- Swiping races no longer changes card height because one race has recovery/save controls.
- A player can tap an AVG row and reconcile that number with real race outcomes immediately.
- Schedule looks centered and opaque on the target iPhone.
- The website states the rules once, then ends cleanly.
- Final store assets are accepted dimensions and the complete shipped flow stays within existing performance gates.
