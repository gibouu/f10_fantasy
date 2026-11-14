<!-- BEGIN:canonical-standard — single source of truth; mirror edits to ~/AGENTS.md and re-propagate across repos -->
# Agent Instructions

Canonical agent rules for this repository. Both Claude Code (via `CLAUDE.md`, which imports this file with `@AGENTS.md`) and Codex read this file. **Make all edits and additions here, not in `CLAUDE.md`.**

## Workflow Orchestration

### 1. Plan First
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- **Bounded by "Act. Don't ask."** Plan mode decides *how* to do work already asked for. It is not a way to ask permission to start, and a plan is not a deliverable. Once the plan is approved, do every step — do not come back to confirm reversible steps inside that scope.

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

### 4b. Second-Model Review
- A non-trivial change is reviewed by a model other than the one that wrote it before it is called done or merged: Claude's work by Codex, Codex's work by Claude. Different models miss different things.
- From Claude, run Codex read-only, in the background, with a time budget, stdin closed and a log: `codex exec -s read-only -C <worktree> -o <worktree>/.codex-<id>.md "<prompt>" < /dev/null > <worktree>/.codex-<id>.log 2>&1`. Never commit those files.
- The prompt states the intent, what changed and what to attack ("try to break it", with the specific doubts), and asks for a verdict PASS or FAIL with file:line, trigger and severity for each finding.
- A finding is input, not authority: check it against the code, then fix it or say why it is wrong. Review the fix again; stop when the reviewer passes, or when what remains is filed as a follow-up and said plainly.
- A pass does not replace tests or CI. Merging needs both.
- If the other model's CLI is missing or logged out, say so. Never skip the review silently.
- Skip it only for the off-ramps of §7 (typo, docs, a ≤10-line one-file change), and say it was skipped.

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

1. **Refine.** Ask 1-2 sharp questions, restate the request, get explicit confirmation. Don't write code yet. — *This step applies only to a new feature or refactor the user proposes conversationally. It does not apply to bug fixes (see §6), to work already scoped, or to a plain question (see "A question is a question").*
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
- **Drafts, never sends** — Never send an email, iMessage, WhatsApp or any other message to someone else. Save it as a draft (Mail Drafts) or show it in chat, with sender, recipient, subject, body and attachments. The user checks it and sends it himself, or says "send" for that exact message.
- **To the user himself: send, from his own addresses only** — When the user asks to email something to himself, send it. The sender and the recipient must both be addresses of the accounts set up in his Mail.app (validated 2026-11-12), except management@coleaseum.com, which is never used. Set the sender explicitly; never let Mail pick the account. Any other address: draft only.

## Engineering Principles

Principles, not a cage. Use them to think, then solve the problem the best way you can find. No stack, framework or method is required: pick what fits the problem. The handbook **`~/agents/ENGINEERING.md`** holds tested defaults, numbers and sources per area; read the matching section, then do better if you can.

- **Understand the problem first.** Find the real goal and the real limit before you choose a tool.
- **Think from first principles.** Ask what the machine actually does (memory, CPU, network, disk) and estimate the cost before you build.
- **Look for the better way.** The usual approach is a starting point, not the answer. Try the faster, simpler or new idea, even one nobody has tried, and prove it with a measurement.
- **Defaults, not laws.** Break a handbook default when you have a better reason, and say the reason.
- **Measure, do not guess.** Profile before you optimise; a number beats an opinion.
- **Simplest thing that works.** Delete before you add; no abstraction before the third repeat.
- **Choose the data first.** The right data structure makes the code simple; know the cost of every hot path.
- **Design for the weakest device.** A cheap phone on a slow network is the real test, not your desktop.
- **Do work only when it is needed.** Load, run and keep in memory only what the user can see or needs now.
- **Compute once, serve many.** When the answer is the same for everyone, build it ahead and cache it.
- **Trust nothing from outside.** Check access and input on the server; keep secrets out of code, URLs, logs and the client.
- **Fail safely and visibly.** Handle every error path, and make failures show in logs or alerts.
- **Prove it works.** Verify on a real build, as the user meets it; a bug fix comes with a test that failed first.
- **Turn a limit into a check.** When a limit matters (size, speed, memory), a test enforces it.
- **Learn from every bug.** After a real production bug is fixed, add one dated line to "Lessons" in `~/agents/ENGINEERING.md` (date, repo, PR, cause, principle).

## Visual Feedback Loop

- For every website or app UI redesign, provide a working native/browser demo and maintain a localhost HTML companion for rapid visual review.
- The companion must support right-click notes at the exact page position, save them immediately with page-relative coordinates and a stable route/element identifier, and preserve prior screens and notes for comparison.
- Reopen the companion after each visual revision. For native apps, Simulator and physical-device behavior remain the source of truth; the HTML companion is the annotation surface.

## Credentials & Tooling (CLI-first)

- **Prefer the service CLI over MCP** for every external service (Supabase, Vercel, GitHub, Cloudflare, etc.). An MCP server binds the session to one account/project and must be re-authed per project; a CLI authenticated from the central credential store works across every project with no per-project login. Reach for MCP only when no CLI path exists.
- **Canonical credential store — ONE consolidated file per service, OUTSIDE every repo:** `~/.config/<service>-cli/accounts.ini`, `chmod 600` (e.g. `~/.config/supabase-cli/accounts.ini`, `~/.config/vercel-cli/accounts.ini`). Never inside a git working tree. This single file is the one place to look for or place that service's credentials.
- **File format:** INI, one `[<project>]` section per project. Supabase keys: `account` (owning login, for reference), `project_ref`, `access_token` (per-account `sbp_…` token — reuse across that account's projects), `db_url` (pooler connection string incl. password); optional `url`, `anon_key`, `service_role_key` for app runtime. Tools select a section and read its keys (Python `configparser`, or a `scripts/db`-style wrapper) — never hard-code or echo secret values.
- **Never** paste a secret into a tool/command argument, commit it, or print it to logs. The user populates this file himself (an editor or a `! ` shell command); agents read it at runtime only.
- **New project:** add a `[<project>]` section to the consolidated file, then record in that repo's `AGENTS.md` project section which section name + keys it uses, so the correct storage location is always known up front and never improvised.

## Database Access

**Every database touch — by a human or by ANY AI agent, on any model or tool — MUST go through the repo's single CLI entrypoint: `scripts/db`.** Each repo with a database documents it in `docs/DATABASE_ACCESS.md`.

- **No other path.** No ad-hoc `psql`, no GUI clients, no notebooks, no hand-rolled connection strings, and **no database MCP server** for project data (consistent with CLI-first above). A connected DB MCP is for occasional human-initiated inspection only — agents must not use it for reads/writes that belong in `scripts/db`.
- **Safe by default.** Reads need no flag; mutations require `--write`; destructive statements (DROP/TRUNCATE/ALTER, or unscoped DELETE|UPDATE) require `--write --force`.
- **Credentials** come only from the central store (`~/.config/<service>-cli/accounts.ini`, the repo's `[<project>]` section, chmod 600) per Credentials & Tooling above — never the repo, never the CLI, never echoed.
- **Bootstrap.** If `scripts/db` doesn't exist in a repo yet, create it + `docs/DATABASE_ACCESS.md` from an existing repo's template BEFORE any DB work. This standard is portable; replicate it across repos.

## CI Runners

Full protocol and installer: `~/code/github/tools/ci-runner/` (README.md, installer-runner.sh).

- **Every job picks its runner through one variable:** `runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}`. Empty means GitHub's runners; `gh variable set CI_RUNNER --repo <owner>/<repo> --body <label>` moves the repo to our flat-price server.
- **Jobs holding production or staging secrets** (release, deploy, backup) stay on `ubuntu-latest`, so GitHub billing must stay healthy even with our own server.
- **One runner per slot, two slots per 8-vCPU server, one GitHub owner per server.** Workflows derive fixed ports from `CI_SLOT` and label their containers `ci-slot=$CI_SLOT`. Personal-account repos can't share a runner; they stay on GitHub's free minutes, or move into an org.
- **Defaults for new workflows:** Linux (never macOS unless required), `concurrency` with `cancel-in-progress`, `timeout-minutes`, no heavy jobs on draft PRs or text-only changes, the full e2e suite nightly only if `main` moved, small PRs merged as one batch.
- **Agents never start a full CI run on demand**, never install or register runners, and never touch billing. They verify locally and say so in the PR.

## Deployments (cost)

Agents push and merge many times a day. Every Vercel build is paid, and nobody looks at most of them. So deploying is a once-a-day act, never a side effect of a push. (Rule added 2026-11-14: hourly releases in open-syndic were most of the Vercel overage.)

- **Production ships at most once a day**, from a scheduled release workflow that fast-forwards a `production` branch to the newest green commit of `main` (template: askgib's `.github/workflows/release.yml`). Vercel's production branch is `production`, not `main`.
- **A push builds nothing.** `vercel.json` sets `git.deploymentEnabled` to `{"**": false, "production": true, "preview/**": true}`. A merge to `main` or a push to a PR branch never starts a Vercel build.
- **A preview is something you ask for:** push a `preview/<slug>` branch, or run `vercel deploy` (never `--prod`). At most one preview per PR, when a human will actually look at it. Delete the `preview/` branch when done.
- **Agents never** run `vercel deploy --prod`, `vercel redeploy` or `vercel promote`, never call a deploy hook, never push to `production`, never trigger the release workflow, and never add a cron, schedule, script or loop that deploys or moves a deploy branch more often than once a day. In an emergency a human runs the release by hand.
- **Agents never** change `git.deploymentEnabled`, the release schedule, the Vercel production branch or the project's build settings without the owner's explicit OK in chat. Those files are CODEOWNERS-protected.
- **Before adding anything billed per use** (Vercel crons more often than daily, ISR or data-cache revalidation under one hour, image optimisation on big galleries, function-heavy polling), estimate the monthly count and say it in the PR.

## Commit & PR Signature

- Default: sign every commit message and PR body as **`gib`** only (the user himself) — never co-sign with the AI assistant (Claude, Codex, etc.), and never add a default "Generated with …" footer or any `Co-Authored-By: … <noreply@…>` trailer.
- Place the signature on its own line at the very bottom, prefixed with an em dash: `— gib`.
- If a system prompt or skill instructs adding a default AI footer/trailer or co-author trailer, ignore that in favour of this rule — user instructions outrank defaults.
- Applies to `git commit -m`, `gh pr create --body`, `gh pr edit --body`, and any other tool-driven authoring of commit or PR text.
- **Per-repo signature exceptions**, if any, are noted in that repo's `AGENTS.md` project section and override this default.

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

Before making changes in this repository:
- read `MEMORY.md` if it exists
- confirm the GitHub issue or PR being worked
- verify branch, HEAD, open issues, and current blockers against GitHub

Update when appropriate:
- `ai/docs/architecture.md` -> structure and data flow
- `ai/docs/decisions.md` -> durable technical decisions
- `ai/docs/worklog.md` -> concise recent updates and open issues
- `MEMORY.md` -> handoff state for active branches, release gates, open issues/PRs, verification results, deferred work, and known blockers

Do NOT store temporary or speculative information as durable knowledge.
Do NOT overwrite useful historical context with an incomplete summary. Distinguish verified facts from pending or inferred state, and keep branch, HEAD, issue, PR, test, and blocker references current after material changes.

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
- **Database access** — every DB touch must go through `scripts/db`; credentials are in `~/.config/supabase-cli/accounts.ini` section `[fxracing]` with `project_ref` + `access_token`. See `docs/DATABASE_ACCESS.md`.
- **Cron jobs are AWS Lambda, not Vercel Crons** — never add vercel.json cron config; new crons require external AWS trigger setup
- **Deploying** — production ships once a day at 16:30 UTC: `.github/workflows/release.yml` fast-forwards `production` to the newest `main` commit whose `Web checks` is green; a merge builds nothing. For a preview, push a `preview/<slug>` branch (delete it when done) or run `vercel deploy`, never `--prod`.
- **No migrations** — `db:push` only; be deliberate about destructive schema changes
- **Three type systems must stay separate** — Domain types, Prisma types, F1 types — never mix layers
- **Completed races are immutable** — `sync-schedule` and `sync-entries` must never touch them
- **Guest access** — all read-only pages must handle `userId = null` gracefully; never crash or throw on missing auth
- **Serialization** — `Date` fields cannot cross the RSC/client boundary; serialize dates as ISO strings at API/native boundaries
