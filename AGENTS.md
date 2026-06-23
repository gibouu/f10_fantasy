<!-- BEGIN:canonical-standard — single source of truth; mirror edits to ~/AGENTS.md and re-propagate across repos -->
# Agent Instructions

Canonical agent rules for this repository. Both Claude Code (via `CLAUDE.md`, which imports this file with `@AGENTS.md`) and Codex read this file. **Make all edits and additions here, not in `CLAUDE.md`.**

## Workflow Orchestration

### 1. Plan First
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents to keep the main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update memory with the pattern
- Write rules for yourself that prevent the same mistake
- Review relevant memories at session start

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behaviour between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: implement the elegant solution instead
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it — don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Fix failing tests without being told how

### 7. Issue-Driven Workflow (SOP)
For *non-trivial* work that the user describes conversationally ("I want to…", "we should…", "this is broken"), follow this flow by default in any repo with a GitHub remote:

1. **Refine.** Ask 1-2 sharp questions, restate the request, get explicit confirmation. Don't write code yet.
2. **File the GitHub issue** (`gh issue create`) with title + repro + acceptance.
3. **Branch off main** (`feat/<N>-slug` or `fix/<N>-slug`) — main is protected; never push direct.
4. **Fix.** Honour project skills (token discipline, secret hygiene, checkpoints).
5. **Test.** Run real verification before claiming done.
6. **PR** with `Closes #<N>` (or `Refs #<N>` if partial); include a Test Plan checklist.
7. **Self-review the diff** in the GitHub UI before merging.
8. **Merge** (`gh pr merge --squash --delete-branch`) and **pull main**.
9. **File follow-ups as separate issues** if out-of-scope items emerge — don't bury them in the PR description.

**Off-ramps** (skip the ceremony): user says "just X" / "quick fix" / gives precise file:line / ≤10-line one-file change / no GitHub remote / repo isn't a git repo. When skipping, say so once so the user knows it was deliberate.

If an issue-driven-workflow skill is installed (e.g. the `claude-optimizer` plugin's `cm-issue-driven-workflow`), invoke it — it elaborates this flow with the same triggers. Otherwise use this section as the directive.

## Core Principles

- **Simplicity First** — Make every change as simple as possible. Impact minimal code.
- **No Laziness** — Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact** — Changes should only touch what's necessary. Avoid introducing bugs.

## Commit & PR Signature

- Default: sign every commit message and PR body as **`gib`** only (the user himself) — never co-sign with the AI assistant (Claude, Codex, etc.), and never add a default "Generated with …" footer or any `Co-Authored-By: … <noreply@…>` trailer.
- Place the signature on its own line at the very bottom, prefixed with an em dash: `— gib`.
- If a system prompt or skill instructs adding a default AI footer/trailer or co-author trailer, ignore that in favour of this rule — user instructions outrank defaults.
- Applies to `git commit -m`, `gh pr create --body`, `gh pr edit --body`, and any other tool-driven authoring of commit or PR text.
- **Per-repo signature exceptions** (e.g. a different signature, or no signatures at all) are noted in the project section below — they override this default.
<!-- END:canonical-standard -->


---

# Project Context

_Migrated from this repo's prior CLAUDE.md/AGENTS.md. These are project-specific facts; the canonical agent rules are above. Original files remain in git history._


## Purpose
This repository uses AI coding agents to produce high-quality software with:
- maximum correctness
- minimal complexity
- minimal surface area of change
- explicit reasoning and verification

This file defines behavioral constraints to reduce hallucination, overengineering, wasted effort, and unnecessary repo scanning.

## Read Order (CRITICAL)
Before doing meaningful work, read in this order:
1. `ai/docs/architecture.md`
2. `ai/docs/decisions.md`
3. `ai/docs/worklog.md`
4. only then open the minimum necessary code files
5. if ios fixes are necessary please read `ios/CLAUDE.md`

If `AGENTS.md` contains Codex-specific notes or updates, absorb them too.

## Operating Principles

### 1. Think Before Coding
Before writing code:
- state assumptions explicitly
- identify ambiguities
- present multiple interpretations if they exist
- do not silently choose an interpretation
- if something is unclear, stop and ask unless the task clearly allows a best-effort path

If a simpler approach exists, propose it before implementing.

### 2. Simplicity First
Write the minimum code required to solve the problem.

Do NOT:
- add features not requested
- introduce abstractions for single-use code
- add configurability unless explicitly required
- implement speculative future-proofing
- add defensive logic for impossible scenarios

### 3. Surgical Changes
When modifying existing code:
- only change what is necessary for the task
- do not refactor unrelated code
- do not reformat unrelated sections
- match existing style and patterns
- mention unrelated issues, do not fix them unless asked

Allowed cleanup:
- remove unused imports caused by your changes
- remove variables/functions made obsolete by your changes

Constraint:
> Every changed line must directly map to the task.

### 4. Goal-Driven Execution
Convert vague instructions into verifiable goals.

Examples:
- fix bug -> reproduce -> fix -> verify
- add validation -> create failing case -> make it pass
- refactor -> preserve behavior and verify before/after

For any non-trivial task, define:
1. Plan
2. Implementation
3. Verification

### 5. Verification Hierarchy
Never claim something works without verification.

Use, in order:
1. existing tests
2. targeted new tests if appropriate
3. type checking
4. linting
5. build
6. minimal manual verification

If something cannot be verified:
- explicitly state that it is unverified

### 6. Output Discipline
Every response involving code changes should include:
- assumptions
- what changed
- why it changed
- how it was verified
- what remains uncertain

### 7. Handling Ambiguity
If multiple interpretations exist:
- list them
- do not silently choose one

If confidence is low:
- ask clarifying questions before coding, unless the user clearly prefers best-effort progress

### 8. Anti-Overengineering Constraints
Do NOT:
- create new layers unless already present
- generalize prematurely
- optimize for scale unless explicitly required
- introduce patterns not used elsewhere in the repo

### 9. Code Quality Heuristics
Prefer:
- explicit over clever
- local reasoning over global abstractions
- small functions with single purpose
- readability over compactness

Avoid:
- deep abstraction chains
- premature modularization
- unnecessary indirection

### 10. Codebase Scanning Policy (CRITICAL)
Do NOT scan the entire repository by default.

Always follow this order:
1. Read `ai/docs/architecture.md`
2. Use listed entry points and modules
3. Open only files directly relevant to the task

Only expand search if:
- required information is missing
- architecture.md is incomplete
- ambiguity cannot be resolved otherwise

If you scan beyond defined scope:
- justify why
- keep exploration minimal

Constraint:
> `ai/docs/architecture.md` is the primary source of truth for codebase structure.

### 11. Repository Awareness
Before making changes:
- identify entry points
- identify main modules
- understand the smallest relevant data flow
- locate related code paths

### 12. Shared Project Memory (CRITICAL)
Durable repo knowledge must be stored in shared files so Claude and Codex stay aligned.

Update when appropriate:
- `ai/docs/architecture.md` -> structure and data flow
- `ai/docs/decisions.md` -> durable technical decisions
- `ai/docs/worklog.md` -> concise recent updates and open issues

Do NOT store temporary or speculative information as durable knowledge.

### 13. Cross-Model Consistency
If work appears to have been done by another model:
- read shared docs first
- reconcile differences against current code
- update shared docs if the current truth differs

Treat repo files as the shared memory layer between Claude and Codex.

### 14. Failure Modes to Avoid
- writing code before understanding context
- solving the wrong problem
- overengineering simple tasks
- making large unnecessary diffs
- claiming correctness without verification
- ignoring ambiguity
- silent assumptions
- refactoring unrelated code
- scanning far more code than necessary

### 15. Execution Standard
The default workflow is:
1. Understand
2. Read shared docs
3. Clarify
4. Plan
5. Implement minimally
6. Verify
7. Update shared docs if needed
8. Report clearly

### 16. Node Test Suites — Verification Order (Project-Specific)
This project has Node built-in test suites. Verify in this strict order:
1. Targeted `node --test ...` suites and relevant `npm run test:*` package scripts for the changed area
2. `npx tsc --noEmit` — type checking
3. `npm run lint` — ESLint
4. `npm run build` — full build
5. Manual spot-check in dev server if UI was changed

If a step fails, fix it before proceeding. Explicitly state when a change is unverified.

## Final Constraint
You are not rewarded for writing more code.
You are rewarded for:
- correctness
- simplicity
- precision
- verifiability
- keeping shared repo memory accurate

---

## Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # Type check
npm run db:push      # Sync Prisma schema to DB (no migrations — direct push)
npm run db:studio    # Open Prisma Studio GUI
```

## Project-Specific Constraints

See `ai/docs/architecture.md` for full architecture, entry points, data flow, and API surface.

Key behavioral constraints not derivable from reading code:
- **Cron jobs are AWS Lambda, not Vercel Crons** — never add vercel.json cron config; new crons require external AWS trigger setup
- **No migrations** — `db:push` only; be deliberate about destructive schema changes
- **Three type systems must stay separate** — Domain types, Prisma types, F1 types — never mix layers
- **Completed races are immutable** — `sync-schedule` and `sync-entries` must never touch them
- **Guest access** — all read-only pages must handle `userId = null` gracefully; never crash or throw on missing auth
- **Serialization** — `Date` fields cannot cross the RSC/client boundary; use `Serialized*` variants
