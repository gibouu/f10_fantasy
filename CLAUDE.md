# CLAUDE.md

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

### 16. No Test Framework — Verification Fallback (Project-Specific)
This project has no test framework. Verify in this strict order:
1. `npx tsc --noEmit` — type checking
2. `npm run lint` — ESLint
3. `npm run build` — full build
4. Manual spot-check in dev server if UI was changed

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
