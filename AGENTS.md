# AGENTS.md

Follow `CLAUDE.md` in this repository as the primary instruction file. When working on iOS app fixes, read `ios/CLAUDE.md`.

## Read Order
Before doing meaningful work, read in this order:
1. `ai/docs/architecture.md`
2. `ai/docs/decisions.md`
3. `ai/docs/worklog.md`
4. only then open minimum necessary code files

## Codex Notes
- Do not scan the full repo unless shared docs are insufficient.
- Keep diffs minimal and verification explicit.
- When durable repo knowledge changes, update the shared docs so Claude and Codex remain aligned.
- `ai/docs/` files are committed to the repo — they are shared model memory, not generated output.

## Verification (no test framework)
Run in this order, stop and fix on failure:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run build`
4. Manual spot-check if UI changed

## Key Project Constraints
- Cron jobs are AWS Lambda (not Vercel Crons) — no vercel.json cron config
- `db:push` only — no migration files
- Three type systems must stay separate: Domain, Prisma, F1
- Completed races are immutable — never modify their data
- All read-only pages must handle `userId = null` gracefully
