# Cron Operations

## Purpose
Canonical runbook for scheduled jobs.

The app is deployed on Vercel, but cron ownership lives outside Vercel. EventBridge Scheduler invokes the AWS Lambda cron orchestrator, and that Lambda POSTs to the app's `/api/cron/*` route handlers over HTTPS.

## Runtime Ownership

- Scheduler: AWS EventBridge Scheduler
- Orchestrator: AWS Lambda `fx-cron-orchestrator` in `us-east-1`
- Invoke role: `scheduler-lambda-role`
- Required invoke policy: inline `InvokeCronOrchestrator` policy scoped to the cron Lambda ARN
- Route auth: `Authorization: Bearer $CRON_SECRET`

Do not add in-repo cron schedules for these jobs. New or changed cadences require an AWS EventBridge schedule and a matching orchestrator mapping.

## Routes

| Route | External schedule | Purpose |
|---|---|---|
| `POST /api/cron/sync-schedule` | `fx-sync-schedule`, `cron(5 0 * * ? *)` | Sync the active season schedule from OpenF1 and reconcile future UPCOMING orphans to CANCELLED. |
| `POST /api/cron/sync-entries` | AWS/EventBridge hourly schedule | Refresh RaceEntry rows for UPCOMING and LIVE races whose grids can still change. |
| `POST /api/cron/lock-picks` | `fx-lock-picks`, `rate(5 minutes)` | Lock pick sets past `lockCutoffUtc` and promote eligible UPCOMING races to LIVE. |
| `POST /api/cron/ingest-results` | `fx-ingest-results`, `rate(5 minutes)` | Ingest qualifying and race results, then compute scores when race results are available. |
| `POST /api/cron/compute-scores` | Manual or targeted orchestrator invocation | Recompute stored scores for a specific race or race type after data repair. |

## Manual Invocation

Use the production app URL and the production `CRON_SECRET`.

```bash
curl -X POST https://www.fxracing.ca/api/cron/sync-schedule \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"
```

Target a specific race for result ingestion:

```bash
curl -X POST https://www.fxracing.ca/api/cron/ingest-results \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"raceId\":\"<race-id>\"}"
```

Recompute scores after a repair:

```bash
curl -X POST https://www.fxracing.ca/api/cron/compute-scores \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"raceId\":\"<race-id>\"}"
```

## Diagnostics

- `GET /api/diag/health` with Bearer `CRON_SECRET` returns a race-weekend pipeline snapshot.
- `GET /api/diag/race/[id]` with Bearer `CRON_SECRET` returns per-race entry, result, pick, and score diagnostics.
- Vercel runtime logs are tagged with prefixes such as `[f10:cron:sync-schedule]`, `[f10:cron:lock]`, `[f10:cron:ingest]`, and `[f10:cron:scores]`.
- In AWS, inspect the EventBridge schedules and Lambda CloudWatch logs when a route has no corresponding Vercel runtime log.

## Operational Notes

- Cron routes are designed to be idempotent or bounded so retries are safe.
- `sync-schedule` soft-skips upstream provider authentication failures so EventBridge does not retry-storm an OpenF1 outage.
- `sync-entries` and `sync-schedule` must not mutate COMPLETED races.
- `ingest-results` uses a per-race advisory lock so overlapping invocations do not double-process the same race concurrently.
- `compute-scores` is normally reached through `ingest-results`; call it directly only for targeted recomputes.
- Any new cron route must document its external schedule here, require Bearer `CRON_SECRET`, and include focused route-level regression coverage.
