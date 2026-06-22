import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const docsRoot = new URL("../../../../ai/docs/", import.meta.url)
const legacyDocsRoot = new URL("../../../../docs/", import.meta.url)

test("cron operations doc is the canonical AWS Lambda runbook", async () => {
  const source = await readFile(new URL("cron-operations.md", docsRoot), "utf8")

  assert.match(source, /AWS Lambda/)
  assert.match(source, /EventBridge/)
  assert.match(source, /CRON_SECRET/)
  for (const endpoint of [
    "/api/cron/sync-schedule",
    "/api/cron/sync-entries",
    "/api/cron/lock-picks",
    "/api/cron/ingest-results",
    "/api/cron/compute-scores",
  ]) {
    assert.match(source, new RegExp(endpoint.replaceAll("/", "\\/")))
  }
})

test("active cron docs do not direct maintainers to Vercel Cron", async () => {
  const docs = await Promise.all([
    readFile(new URL("architecture.md", docsRoot), "utf8"),
    readFile(new URL("decisions.md", docsRoot), "utf8"),
    readFile(new URL("architecture.md", legacyDocsRoot), "utf8"),
    readFile(new URL("project-log.md", legacyDocsRoot), "utf8"),
  ])

  assert.doesNotMatch(docs.join("\n"), /Vercel Cron handles|vercel\.json runs|vercel\.json — cron/i)
})
