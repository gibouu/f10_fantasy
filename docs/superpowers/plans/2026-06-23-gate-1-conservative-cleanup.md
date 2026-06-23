# Gate 1 Conservative Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete issue #271 by removing stale documentation surface area and local ignored artifacts without changing runtime behavior.

**Architecture:** Keep `ai/docs/*` as the canonical engineering memory. Root `docs/*` files become concise current docs or pointers instead of stale MVP-era duplicates. Runtime TypeScript, Swift, API behavior, Prisma schema, and cron behavior are unchanged.

**Tech Stack:** Markdown docs, Node's built-in `node --test`, Next.js 14 App Router, TypeScript, GitHub CLI.

**Execution note:** This plan preserves some stale phrases inside replacement examples so agents can see exactly what text was removed. Those quoted examples are not current repo guidance; the live guidance is the post-replacement text and the final branch diff.

## Global Constraints

- Track this work under GitHub issue #271.
- Branch from `main` as `fix/271-gate-1-conservative-cleanup`.
- Local `main` is currently ahead of `origin/main` by the approved cleanup design commit `7950b4b`; include that commit in the cleanup PR unless the user asks to split it into a separate PR first.
- Do not commit pre-existing `AGENTS.md` or `.clawpatch/` local state.
- Do not change runtime behavior, API contracts, database schema, or iOS app behavior.
- Do not delete operational scripts in this gate; only document risky candidates as follow-up issues if evidence supports it.
- Commit and PR body must end with `— gib`.
- Verify with targeted doc/tooling tests plus `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

---

## File Structure

- Modify `README.md`: update Vercel CLI baseline to 54.15.0 or newer while keeping `npm i -g vercel@latest`.
- Modify `scripts/vercel-cli-doc.test.mjs`: align the README assertion with the 54.15.0 baseline.
- Modify `ai/docs/architecture.md`: replace the stale "No test framework" line and Vercel CLI command note with current verification/tooling guidance.
- Modify `ai/docs/ai-workflow.md`: replace the stale "no test framework" verification section with current test-first verification order.
- Modify `ios/CLAUDE.md`: clarify that iOS has no native XCTest suite but does have Node-based source regression tests.
- Modify `docs/architecture.md`: replace stale 442-line MVP architecture with a short pointer to `ai/docs/architecture.md`.
- Modify `docs/project-log.md`: replace stale scaffold log with a short pointer to `ai/docs/worklog.md`.
- Modify `docs/product-spec.md`: replace stale web-only/no-sprint MVP assumptions with a concise current product summary.
- Modify `docs/roadmap.md`: replace completed MVP checklist with a pointer to GitHub issues and shared docs.
- Modify `docs/scoring-rules.md`: update scoring formulas to match `src/lib/scoring/formula.ts` and early-bird bonus behavior.
- Local-only cleanup: remove ignored `.DS_Store` files from the working tree; do not stage or commit ignored artifact deletion.

---

### Task 1: Branch and Workspace Guard

**Files:**
- No file content changes.

**Interfaces:**
- Consumes: GitHub issue #271.
- Produces: branch `fix/271-gate-1-conservative-cleanup` ready for doc-only cleanup.

- [ ] **Step 1: Confirm current dirty state**

Run:

```bash
git status --short --branch
```

Expected output includes:

```text
## main...origin/main [ahead 1]
 M AGENTS.md
?? .clawpatch/
```

If the cleanup plan file is still untracked, leave it alone until the user chooses execution. Do not stage `AGENTS.md` or `.clawpatch/`.

- [ ] **Step 2: Update local main**

Run:

```bash
git pull --ff-only
```

Expected: fast-forward succeeds or prints `Already up to date.`

- [ ] **Step 3: Create the cleanup branch**

Run:

```bash
git switch -c fix/271-gate-1-conservative-cleanup
```

Expected:

```text
Switched to a new branch 'fix/271-gate-1-conservative-cleanup'
```

---

### Task 2: Clean Ignored Local Artifacts

**Files:**
- Local ignored files only:
  - `.DS_Store`
  - `ios/.DS_Store`
  - `public/.DS_Store`
  - `src/.DS_Store`

**Interfaces:**
- Consumes: `.gitignore` already ignores `.DS_Store`.
- Produces: a cleaner local working tree without staging any runtime file.

- [ ] **Step 1: Confirm ignored files are untracked**

Run:

```bash
git ls-files | rg '(^|/)\\.DS_Store$'
```

Expected: no output.

- [ ] **Step 2: Remove the ignored `.DS_Store` files**

Run:

```bash
find . -maxdepth 3 -type f -name .DS_Store -not -path './.git/*' -not -path './node_modules/*' -delete
```

Expected: no output.

- [ ] **Step 3: Verify Git status did not gain staged or tracked deletions**

Run:

```bash
git status --short
```

Expected: no deleted `.DS_Store` entries appear.

---

### Task 3: Update Tooling and Verification Docs

**Files:**
- Modify: `README.md`
- Modify: `scripts/vercel-cli-doc.test.mjs`
- Modify: `ai/docs/architecture.md`
- Modify: `ai/docs/ai-workflow.md`
- Modify: `ios/CLAUDE.md`

**Interfaces:**
- Consumes: current package scripts from `package.json`.
- Produces: docs that describe existing `node --test` suites and Vercel CLI 54.15.0 baseline.

- [ ] **Step 1: Update README Vercel CLI text**

In `README.md`, replace:

```markdown
Use Vercel CLI 54.14.2 or newer for deployment-related local commands:
```

with:

```markdown
Use Vercel CLI 54.15.0 or newer for deployment-related local commands:
```

Replace:

```markdown
This was last verified with Vercel CLI 54.14.5.
```

with:

```markdown
Install the latest CLI before deployment work; this repo expects 54.15.0 or newer.
```

- [ ] **Step 2: Update the README regression test**

In `scripts/vercel-cli-doc.test.mjs`, replace:

```js
  assert.match(readme, /Vercel CLI 54\.14\.2 or newer/)
```

with:

```js
  assert.match(readme, /Vercel CLI 54\.15\.0 or newer/)
```

- [ ] **Step 3: Update `ai/docs/architecture.md` testing/tooling bullets**

Replace the key constraint:

```markdown
- **No test framework** — verify via type checking, linting, and build
```

with:

```markdown
- **Regression tests use Node's built-in test runner** — package scripts group route, auth, service, component, page, scoring, iOS-source, and script checks. Use targeted `node --test ...` suites first, then `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
```

Replace the Vercel command note:

```markdown
vercel --version     # local Vercel CLI should be 54.14.2 or newer
```

with:

```markdown
vercel --version     # local Vercel CLI should be 54.15.0 or newer
```

- [ ] **Step 4: Update `ai/docs/ai-workflow.md` verification section**

Replace:

```markdown
## Verification Order (no test framework)
1. TypeScript type checking (`tsc --noEmit`)
2. Linting (`npm run lint`)
3. Build (`npm run build`)
4. Manual spot-check in dev server if UI changed
```

with:

```markdown
## Verification Order
1. Targeted `node --test ...` suite for changed code when one exists
2. TypeScript type checking (`npx tsc --noEmit`)
3. Linting (`npm run lint`)
4. Build (`npm run build`)
5. Manual spot-check in dev server if UI changed
```

- [ ] **Step 5: Update `ios/CLAUDE.md` test note**

Replace:

```markdown
- No test framework
```

with:

```markdown
- No native XCTest suite; iOS regression coverage currently uses Node source tests under `ios/*.test.mjs`, grouped by `npm run test:ios`
```

- [ ] **Step 6: Run the targeted documentation test**

Run:

```bash
node --test scripts/vercel-cli-doc.test.mjs
```

Expected: one passing test.

---

### Task 4: Replace Stale Root Docs With Current Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/project-log.md`
- Modify: `docs/product-spec.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/scoring-rules.md`

**Interfaces:**
- Consumes: canonical engineering docs in `ai/docs/*`.
- Produces: root docs that no longer contradict current code.

- [ ] **Step 1: Replace `docs/architecture.md`**

Set the full file content to:

```markdown
# F10 Racing Architecture

This legacy root architecture document has been retired to avoid drifting from the implementation.

Canonical engineering architecture now lives in [`../ai/docs/architecture.md`](../ai/docs/architecture.md). Read that file first for current entry points, service boundaries, API routes, cron ownership, type-system constraints, and verification guidance.
```

- [ ] **Step 2: Replace `docs/project-log.md`**

Set the full file content to:

```markdown
# F10 Racing Project Log

This legacy scaffold log has been retired.

Current cross-agent project memory lives in [`../ai/docs/worklog.md`](../ai/docs/worklog.md). Durable architecture and decision records live in [`../ai/docs/architecture.md`](../ai/docs/architecture.md) and [`../ai/docs/decisions.md`](../ai/docs/decisions.md).
```

- [ ] **Step 3: Replace `docs/product-spec.md`**

Set the full file content to:

```markdown
# F10 Racing Product Summary

F10 Racing is a Formula 1 fantasy pick'em app for web and iOS.

Users can browse races as guests, make local guest picks, sign in with Apple or web auth, submit server-backed picks, compete on global and friends leaderboards, and view public profiles.

Each race pick set has three slots:
- P10 finisher
- race winner
- DNF driver

The app supports main races and sprint races. Picks lock from the server-provided `lockCutoffUtc`; server writes are authoritative, and locked picks are protected by app, snapshot, and database-trigger layers.

Current architecture, API surface, and platform constraints are maintained in [`../ai/docs/architecture.md`](../ai/docs/architecture.md). Detailed scoring rules are maintained in [`scoring-rules.md`](scoring-rules.md).
```

- [ ] **Step 4: Replace `docs/roadmap.md`**

Set the full file content to:

```markdown
# F10 Racing Roadmap

The original MVP roadmap has been completed and is no longer the source of truth.

Use GitHub issues and pull requests for active roadmap work. Use [`../ai/docs/worklog.md`](../ai/docs/worklog.md) for recent cross-agent project memory, and [`../ai/docs/decisions.md`](../ai/docs/decisions.md) for durable technical decisions.
```

- [ ] **Step 5: Replace `docs/scoring-rules.md`**

Set the full file content to:

```markdown
# F10 Racing Scoring Rules

Scoring source of truth: [`../src/lib/scoring/formula.ts`](../src/lib/scoring/formula.ts). Tests live in [`../src/lib/scoring/formula.test.mjs`](../src/lib/scoring/formula.test.mjs).

## Pick Slots

Each pick set has three slots:
- P10 finisher
- race winner
- DNF driver

Only locked picks are scored. Scoring uses locked pick snapshots when available so post-lock field drift cannot affect results.

## Main Race Scoring

P10 points use an explicit distance table for classified drivers:

| Distance from P10 | Points |
|---:|---:|
| 0 | 25 |
| 1 | 18 |
| 2 | 15 |
| 3 | 12 |
| 4 | 10 |
| 5 | 8 |
| 6 | 6 |
| 7 | 4 |
| 8 | 2 |
| 9+ | 0 |

Winner bonus: +5 for the classified P1 driver.

DNF bonus: +3 for any non-classified result.

Maximum base score: 33.

## Sprint Scoring

Sprint P10 points for classified drivers use:

```text
max(0, 8 - abs(position - 10))
```

Winner bonus: +2 for the classified P1 driver.

DNF bonus: +1 for any non-classified result.

Maximum base score: 11.

## Classification

Only `CLASSIFIED` results earn P10 or winner points. Any non-classified result scores zero for P10/winner and counts for the DNF bonus.

## Early-Bird Bonus

If a pick set locked with `lockedSubmittedBeforeQualifying = true`, scoring adds an early-bird bonus equal to the base score. This makes the stored total score `baseScore * 2` for eligible pick sets.
```

- [ ] **Step 6: Verify cron docs test still passes after root-doc replacement**

Run:

```bash
node --test src/app/api/cron/cron-operations.test.mjs
```

Expected: both cron documentation tests pass.

---

### Task 5: Full Verification and Commit

**Files:**
- Stage only files intentionally modified in Tasks 3 and 4.

**Interfaces:**
- Consumes: completed documentation cleanup from issue #271.
- Produces: one verified commit for the Gate 1 cleanup PR.

- [ ] **Step 1: Run script/docs tests**

Run:

```bash
npm run test:scripts
```

Expected: all script tests pass, including `scripts/vercel-cli-doc.test.mjs`.

- [ ] **Step 2: Run route docs regression**

Run:

```bash
node --test src/app/api/cron/cron-operations.test.mjs
```

Expected: both tests pass.

- [ ] **Step 3: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected:

```text
✔ No ESLint warnings or errors
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: Next.js production build completes successfully.

- [ ] **Step 6: Review the final diff**

Run:

```bash
git diff -- README.md scripts/vercel-cli-doc.test.mjs ai/docs/architecture.md ai/docs/ai-workflow.md ios/CLAUDE.md docs/architecture.md docs/project-log.md docs/product-spec.md docs/roadmap.md docs/scoring-rules.md
```

Expected: diff is documentation/test-only and contains no runtime source changes.

- [ ] **Step 7: Stage only intended files**

Run:

```bash
git add README.md scripts/vercel-cli-doc.test.mjs ai/docs/architecture.md ai/docs/ai-workflow.md ios/CLAUDE.md docs/architecture.md docs/project-log.md docs/product-spec.md docs/roadmap.md docs/scoring-rules.md
```

Expected: staged files are only the ten intended files.

- [ ] **Step 8: Confirm excluded local state remains unstaged**

Run:

```bash
git status --short
```

Expected: `AGENTS.md` and `.clawpatch/` are not staged.

- [ ] **Step 9: Commit**

Run:

```bash
git commit -m $'Clean stale repo documentation\n\n— gib'
```

Expected: commit succeeds with only intended files.

---

### Task 6: Pull Request and Merge

**Files:**
- No new file edits.

**Interfaces:**
- Consumes: verified branch `fix/271-gate-1-conservative-cleanup`.
- Produces: merged PR closing issue #271.

- [ ] **Step 1: Push branch**

Run:

```bash
git push -u origin fix/271-gate-1-conservative-cleanup
```

Expected: branch pushes to GitHub.

- [ ] **Step 2: Create PR**

Run:

```bash
gh pr create --title "Clean stale repo documentation" --body $'Closes #271\n\n## Summary\n- replace stale root docs with current summaries or canonical ai/docs pointers\n- update verification docs to reflect existing node --test suites\n- update Vercel CLI documentation baseline to 54.15.0+\n\n## Test Plan\n- [ ] `npm run test:scripts`\n- [ ] `node --test src/app/api/cron/cron-operations.test.mjs`\n- [ ] `npx tsc --noEmit`\n- [ ] `npm run lint`\n- [ ] `npm run build`\n\n— gib'
```

Expected: GitHub returns a PR URL.

- [ ] **Step 3: Check PR status**

Run:

```bash
gh pr checks --watch
```

Expected: required checks pass or only known external deployment limits fail.

- [ ] **Step 4: Self-review PR diff**

Run:

```bash
gh pr diff
```

Expected: PR diff is docs/test-only and closes #271.

- [ ] **Step 5: Merge PR**

Run:

```bash
gh pr merge --squash --delete-branch
```

Expected: PR merges and remote branch is deleted.

- [ ] **Step 6: Return to main and update**

Run:

```bash
git switch main
git pull --ff-only
```

Expected: local `main` includes the merged cleanup commit.

---

## Follow-Up Criteria After Gate 1

After PR merge, create separate issues instead of expanding this PR if any of these are found:

- Operational scripts that appear obsolete but touch production data.
- Large source modules with repeated logic that need a balanced cleanup pass.
- Compatibility paths that may affect live iOS or web clients.
- Any cleanup that would change API response shapes, scoring, auth, cron behavior, or database schema.
