# Database Access

Every database touch in this repo, by a human or any AI agent, goes through the
single entrypoint **`scripts/db`**. No ad-hoc `psql`, no GUI clients, no
database MCP server for project data, and no hand-written connection strings.

## How It Works

`scripts/db` runs SQL on FX Racing's Supabase Postgres via the Supabase
Management API (`POST /v1/projects/<ref>/database/query`). It authenticates with
the access token from the central credential store, never a committed secret.

This is a direct SQL path for schema checks and maintenance. It is separate from
the public Data API, and it does not require exposing tables to REST clients.

## Credentials

Read from `~/.config/supabase-cli/accounts.ini`, section **`[fxracing]`**
(`chmod 600`, outside every repo, never committed). Required keys:
`project_ref` and `access_token`.

Optional runtime keys such as `url`, `anon_key`, `service_role_key`, and
`db_url` may exist in the same section, but `scripts/db` only needs
`project_ref` and `access_token`.

## Usage

```bash
# Read: no flag needed
./scripts/db 'select count(*) from "Race"'
./scripts/db --json 'select to_regclass('"'"'public."QualifyingResult"'"'"')'

# From a file or stdin
./scripts/db -f /tmp/query.sql
echo 'select 1' | ./scripts/db

# Pick a different central-store section
./scripts/db --section fxracing 'select 1'
```

## Safety Tiers

| Statement | Flag required |
|---|---|
| `SELECT` / `WITH...SELECT` / `EXPLAIN` / `SHOW` / `TABLE` / `VALUES` | none |
| `INSERT` / `CREATE` / `GRANT` / `REFRESH` / scoped `UPDATE`/`DELETE` | `--write` |
| `DROP` / `TRUNCATE` / `ALTER` / `DO` / `CALL`, or `UPDATE`/`DELETE` without `WHERE` | `--write --force` |

The classifier strips comments and string/identifier literals first, so a word
like `DROP` inside a comment or quoted value does not trip the gate.

## Schema Checks

Issue #279 uses this entrypoint to confirm that local and production-like
Supabase schemas include the qualifying rollout objects before removing broad
compatibility fallbacks:

```sql
select
  to_regclass('public."QualifyingResult"') as qualifying_result_table,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Race'
      and column_name = 'openf1QualifyingSessionKey'
  ) as race_has_qualifying_key,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Race'
      and column_name = 'qualifyingStartUtc'
  ) as race_has_qualifying_start;
```
