# F10 Fantasy Cleanup Design

Date: 2026-06-23
Repo: f10_fantasy

## Goal

Clean the repository in progressive risk gates: start with safe cleanup, then move to small proven simplifications, and only do broader restructuring when the evidence justifies it.

The cleanup should reduce stale code, redundant files, outdated docs, and avoidable complexity without changing user-visible behavior unless a later cleanup issue explicitly calls for it.

## Current Context

- The app is a Next.js 14 App Router project with a separate iOS SwiftUI app.
- Business logic belongs in service modules under `src/lib/services`.
- Domain, Prisma, and F1 provider types must remain separate.
- Date serialization boundaries must stay intact for RSC/client props.
- Cron jobs are AWS Lambda/EventBridge driven, not Vercel Crons.
- The repo currently has pre-existing local dirty state in `AGENTS.md` and `.clawpatch/`; cleanup work must avoid committing those unless explicitly requested.
- Clawpatch currently reports zero open findings.

## Cleanup Gates

### Gate 1: Conservative Cleanup

Only remove or adjust items that are demonstrably unused, stale, or redundant.

Allowed examples:
- Unused imports, props, helpers, and files proven by typecheck/lint/tests.
- Obsolete generated or temporary artifacts.
- Stale documentation/worklog entries that no longer describe current behavior.
- Duplicate local tests or scripts that are fully superseded and have no unique coverage.
- Clawpatch leftover state only if explicitly safe and intentionally excluded from source control.

Not allowed in this gate:
- Behavior changes.
- API contract changes.
- Schema changes.
- Large file moves.
- Renaming public exports unless every consumer is updated and verified.

### Gate 2: Balanced Cleanup

Make small simplifications where the repo already provides clear tests or stable boundaries.

Allowed examples:
- Consolidate duplicated normalization or validation helpers.
- Simplify API route wrappers while preserving error mapping and request-body parsing patterns.
- Tighten small component/service internals where behavior is covered.
- Remove compatibility branches that are provably unreachable and not relied on by iOS/web clients.
- Update shared docs when they are materially stale.

Constraints:
- Each balanced cleanup should be its own issue/branch/PR if it touches a meaningful module boundary.
- No speculative abstraction.
- Verification must include targeted tests plus the project fallback sequence where appropriate.

### Gate 3: Aggressive Cleanup

Only do broader restructuring when Gates 1 and 2 reveal a concrete, high-value problem.

Allowed examples:
- Split a module that is doing too much and is actively blocking safe changes.
- Remove an old compatibility path after confirming no live app/API consumer needs it.
- Delete or replace scripts that create operational risk.
- Rework a repeated pattern across multiple areas when the existing pattern causes bugs or heavy maintenance.

Constraints:
- Must have a dedicated GitHub issue describing the exact problem, risk, migration plan, and rollback path.
- Must use focused PRs, not a broad refactor bundle.
- Must preserve iOS/web/API compatibility unless the issue explicitly authorizes a breaking change.

## Workflow

1. Create a GitHub cleanup issue for the first gate.
2. Branch from `main` using the repo's issue-driven workflow.
3. Make one narrow cleanup PR at a time.
4. Run verification before claiming a cleanup is safe.
5. Merge each PR before starting the next cleanup batch.
6. File separate follow-up issues for any risky or out-of-scope findings.

## Verification

Use the repo's verification order unless a touched area requires extra checks:

1. Targeted `node --test ...` suites for changed testable modules
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run build`
5. `npm run test:ios` and `xcodebuild` when iOS files are touched

For documentation-only cleanup, verify by reviewing the diff and ensuring no code paths were changed.

## Git Hygiene

- Do not commit pre-existing `AGENTS.md` or `.clawpatch/` changes unless the user explicitly asks.
- Each commit and PR body must be signed with `— gib`, matching the project instructions for authored GitHub text.
- Avoid broad formatting churn.
- Every changed line should map to the cleanup issue being addressed.

## Success Criteria

- Gate 1 completes without behavior changes and with a passing verification suite.
- Any Gate 2 or Gate 3 work has a clear issue, scoped PR, and verification evidence.
- The repo ends with less stale or redundant surface area and no untracked cleanup artifacts committed by accident.
- Shared docs remain accurate where cleanup changes durable project knowledge.
