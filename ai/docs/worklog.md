# Worklog

## Purpose
Shared short-term memory between Claude and Codex.

Use for:
- concise summaries of meaningful changes
- important in-progress findings
- known open issues
- next recommended checks

Do NOT turn this into a giant diary.

## Update Rules
- Keep entries short
- Prefer newest-first
- Remove stale noise
- When a fact becomes durable, move it to `architecture.md` or `decisions.md`

## Entry Format
### YYYY-MM-DD HH:MM — Short title
- by: Claude / Codex / human
- summary:
- files touched:
- verification:
- open questions:
- should update architecture?: yes/no
- should update decisions?: yes/no

---

## Entries

### 2026-04-26 18:10 — Scoring source-of-truth cleanup
- by: Codex
- summary: Centralized race scoring constants, changed sprint P10 max to 8, added server score-guide fields for result-row previews, and aligned iOS completed-race result rows with server-provided preview scoring instead of local formula math.
- files touched: `src/lib/scoring/formula.ts`, `src/app/api/races/[id]/route.ts`, `ios/FXRacing/Features/Races/RaceDetailView.swift`, `ios/FXRacing/Core/Models/Pick.swift`, `ios/FXRacing/Core/Models/Race.swift`
- verification: `npx tsc --noEmit`; focused `npx tsx` formula check for P1-P20 main/sprint + DNF/DNS/DSQ; `npm run lint`; `npm run build`; iOS `xcodebuild ... -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FXRacingDerivedData build`
- open questions: After deploy, call `POST /api/cron/compute-scores` with `{ "raceType": "SPRINT" }` and `Authorization: Bearer CRON_SECRET` to recompute stored sprint scores.
- should update architecture?: yes
- should update decisions?: yes

### 2026-04-23 09:42 — iOS username availability race fix
- by: Codex
- summary: Fixed iOS onboarding so stale username availability responses cannot mark the current text available; submit now only enables for the exact checked username and 409 submit failures flip the UI to taken. Username availability/suggestion API GETs are force-dynamic with no-store headers. DB inspection confirmed `testapple` exists in production, so the red submit error was correct and the green availability state was stale.
- files touched: `ios/FXRacing/Features/Onboarding/UsernamePickerViewModel.swift`, `src/app/api/users/username/route.ts`, `src/app/api/users/suggest-usernames/route.ts`
- verification: `npx tsc --noEmit`; `npm run lint`; `npm run build`; iOS `xcodebuild ... -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FXRacingDerivedData build` passed outside sandbox.
- open questions: Whether to delete old App Review test accounts/usernames from production requires an explicit destructive-data decision.
- should update architecture?: no
- should update decisions?: no

### 2026-04-15 — ai-system framework integration
- by: Claude
- summary: Integrated ai-system shared-docs framework into f10_fantasy as pilot project. Added ai/docs/ structure, updated CLAUDE.md with read-order + shared-docs protocol, created AGENTS.md.
- files touched: CLAUDE.md, AGENTS.md, ai/docs/architecture.md, ai/docs/decisions.md, ai/docs/worklog.md, ai/docs/ai-workflow.md
- verification: File structure matches ai-system template; architecture.md populated from existing CLAUDE.md content; decisions.md reflects accepted technical choices.
- open questions: None.
- should update architecture?: no
- should update decisions?: no

### 2026-04-15 — P10 scoring fix: superseded
- by: Claude
- summary: Historical note only; current scoring source of truth is the 2026-04-26 entry and `ai/docs/decisions.md`.
- files touched: `src/lib/scoring/formula.ts`, `src/components/race/RaceResultsCard.tsx`
- verification: Unit-checked formula manually against grid positions.
- open questions: None.
- should update architecture?: no
- should update decisions?: yes → added to decisions.md

### 2026-04-15 — Race Results collapsed to single pts column
- by: Claude
- summary: RaceResultsCard UI simplified to collapse multiple point columns into one `pts` column.
- files touched: `src/components/race/RaceResultsCard.tsx`
- verification: Visual only — no logic changed.
- open questions: None.
- should update architecture?: no
- should update decisions?: no
