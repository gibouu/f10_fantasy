import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const reconcileSource = await readFile(
  new URL("./reconcile-2026-calendar.ts", import.meta.url),
  "utf8",
)
const renumberSource = await readFile(
  new URL("./renumber-2026-rounds.ts", import.meta.url),
  "utf8",
)
const restoreSource = await readFile(
  new URL("./restore-cancelled-races.ts", import.meta.url),
  "utf8",
)

function assertRequiresActive2026Season(source, scriptName) {
  assert.match(
    source,
    /const season = await getActiveSeason\(\)[\s\S]*if \(season\.year !== 2026\)[\s\S]*process\.exit\(1\)/,
    `${scriptName} should abort before planning writes unless the active season is 2026`,
  )
}

test("2026 calendar reconciliation refuses non-2026 active seasons", () => {
  assertRequiresActive2026Season(
    reconcileSource,
    "scripts/reconcile-2026-calendar.ts",
  )
})

test("2026 round renumbering refuses non-2026 active seasons", () => {
  assertRequiresActive2026Season(
    renumberSource,
    "scripts/renumber-2026-rounds.ts",
  )
})

test("cancelled race restore is constrained to the 2026 season", () => {
  assert.match(
    restoreSource,
    /season:\s*\{\s*year:\s*2026\s*\}/,
    "scripts/restore-cancelled-races.ts should not restore matching race names outside 2026",
  )
})
