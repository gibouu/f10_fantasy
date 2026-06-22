/**
 * GET /api/diag/health
 *
 * Race-weekend overview. Returns one JSON blob with:
 *   - server time
 *   - the next 3 upcoming races (with timing relative to now)
 *   - the most recent 3 races (with results + score coverage)
 *   - any pipeline-level issues across that window
 *
 * Designed to be curl-able from a phone — when something feels wrong on
 * Saturday, hit this first to get a one-screen snapshot. For deeper detail
 * on a specific race, follow up with /api/diag/race/<id>.
 *
 * Protected by CRON_SECRET. Bearer header required.
 */

import type { NextRequest } from "next/server"
import { db } from "@/lib/db/client"
import { handleDiagHealthGet } from "./get-handler"

export async function GET(req: NextRequest) {
  return handleDiagHealthGet(req, { db })
}
