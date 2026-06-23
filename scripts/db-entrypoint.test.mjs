import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFile, stat } from "node:fs/promises"

test("repo documents and wires the canonical database entrypoint", async () => {
  const [script, docs, agents, pkgRaw, scriptStat] = await Promise.all([
    readFile(new URL("./db", import.meta.url), "utf8"),
    readFile(new URL("../docs/DATABASE_ACCESS.md", import.meta.url), "utf8"),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    stat(new URL("./db", import.meta.url)),
  ])
  const pkg = JSON.parse(pkgRaw)

  assert.match(script, /default=os\.environ\.get\("DB_SECTION", "fxracing"\)/)
  assert.match(script, /api\.supabase\.com\/v1\/projects\/\{ref\}\/database\/query/)
  assert.match(script, /destructive statement .*requires --write --force/s)
  assert.ok(scriptStat.mode & 0o111, "scripts/db should be executable")

  assert.match(docs, /\[fxracing\]/)
  assert.match(docs, /scripts\/db/)
  assert.match(docs, /~\/\.config\/supabase-cli\/accounts\.ini/)
  assert.match(agents, /\[fxracing\]/)

  assert.match(pkg.scripts["test:scripts:static"], /scripts\/db-entrypoint\.test\.mjs/)
})

test("database entrypoint classifies SQL safety gates", () => {
  const cases = [
    ["select 1", "read"],
    ["select 'drop table \"Race\"'", "read"],
    ["select '--'; drop table \"Race\";", "force"],
    ["select '/*'; truncate table \"Race\";", "force"],
    ['insert into "Race" ("id") values (\'r1\')', "write"],
    ['update "Race" set "name" = "name" where "id" = \'r1\'', "write"],
    ['delete from "Race" where "id" = \'r1\'', "write"],
    ['update "Race" set "name" = "name"; select 1 where true;', "force"],
    ['delete from "Race"; select 1 where true;', "force"],
    ['update "Race" set "name" = (select \'x\' where true);', "force"],
    ['with wiped as (delete from "Race") select 1;', "force"],
    ['with changed as (update "Race" set "name" = \'x\') select 1;', "force"],
    ['with changed as (update "Race" set "name" = \'x\' where "id" = \'r1\') select 1;', "write"],
    ['do $$ begin delete from "Race"; end $$;', "force"],
    ['call refresh_race_results()', "force"],
  ]
  const python = `
import importlib.machinery
import json
import sys

mod = importlib.machinery.SourceFileLoader("db_script", "scripts/db").load_module()
cases = json.loads(sys.stdin.read())
actual = [[sql, mod.classify(sql)] for sql, _expected in cases]
print(json.dumps(actual))
`
  const result = spawnSync("python3", ["-c", python], {
    cwd: new URL("..", import.meta.url),
    input: JSON.stringify(cases),
    encoding: "utf8",
  })

  assert.equal(result.status, 0, result.stderr)
  const actual = JSON.parse(result.stdout)
  assert.deepEqual(
    actual,
    cases.map(([sql, expected]) => [sql, expected]),
  )
})
