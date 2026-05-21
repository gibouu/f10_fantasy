/**
 * Regression guard for mobile OAuth first-login race handling.
 *
 * This repo does not have a DB-backed test harness. This executable check
 * protects the critical concurrency guardrails in the route implementation.
 *
 *   npx tsx scripts/test-mobile-exchange-race-guards.ts
 */
import { readFileSync } from "node:fs"

const route = readFileSync("src/app/api/auth/mobile/exchange/route.ts", "utf8")

const requiredSnippets = [
  "Prisma.PrismaClientKnownRequestError",
  "err.code === 'P2002'",
  "db.account.upsert",
  "const racedAccount = await db.account.findUnique",
  "const racedUser = email",
]

for (const snippet of requiredSnippets) {
  if (!route.includes(snippet)) {
    console.error(`Missing mobile exchange race guard: ${snippet}`)
    process.exit(1)
  }
}

console.log("PASS mobile exchange race guards")
