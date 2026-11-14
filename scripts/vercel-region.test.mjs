import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
)

// The Supabase database lives in eu-west-2 (London). Functions previously ran
// in the Vercel default (iad1, Washington DC), so every query crossed the
// Atlantic: a primary-key findUnique measured 393ms in production. lhr1 is
// Vercel's London region — the same side of the ocean as the database.
test("functions run in the same region as the database", () => {
  assert.deepEqual(config.regions, ["lhr1"])
})

test("cron routes keep their extended duration", () => {
  assert.equal(config.functions["src/app/api/cron/**"].maxDuration, 60)
})

// Deploy cost (#424): only `production` (moved once a day by
// .github/workflows/release.yml) and `preview/**` build. A push to main or
// to a PR branch builds nothing.
test("only production and preview/** branches deploy", () => {
  assert.deepEqual(config.git.deploymentEnabled, {
    "**": false,
    production: true,
    "preview/**": true,
  })
})
