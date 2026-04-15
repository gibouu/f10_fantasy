# AI Workflow

## Standard Loop
1. Read `ai/docs/architecture.md`
2. Read `ai/docs/decisions.md`
3. Read `ai/docs/worklog.md`
4. Understand the task — state assumptions explicitly
5. Define success criteria
6. Implement the minimal solution
7. Verify (type check → lint → build → manual spot-check)
8. Update shared docs if durable knowledge changed
9. Report clearly: what changed, why, how verified, what remains uncertain

## Principles
- simple beats clever
- verified beats assumed
- minimal diffs beat broad rewrites
- architecture-first beats repo-wide scanning
- shared docs are the cross-model memory layer

## Verification Order (no test framework)
1. TypeScript type checking (`tsc --noEmit`)
2. Linting (`npm run lint`)
3. Build (`npm run build`)
4. Manual spot-check in dev server if UI changed

## When to update shared docs
- `architecture.md` — new entry point, module, API route, or constraint discovered
- `decisions.md` — a non-obvious technical choice was made that will matter again
- `worklog.md` — any meaningful change; remove stale entries older than ~1 month
