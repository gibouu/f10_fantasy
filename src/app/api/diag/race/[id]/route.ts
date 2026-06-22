/**
 * GET /api/diag/race/[id]
 *
 * Single-shot pipeline diagnostic for a race. Returns one JSON blob containing
 * the race row, entrant count, result count, pick-set count, score-breakdown
 * count, and any obvious mismatches the cron pipeline can leave behind.
 *
 * Designed to be curl-able from a phone via iOS Shortcuts when watching a race
 * weekend, e.g.:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.fxracing.ca/api/diag/race/<id> | jq
 *
 * Protected by CRON_SECRET (same secret the cron Lambdas use). Not routed
 * through the middleware's public-API allowlist — every request must carry the
 * Bearer header.
 */

import type { NextRequest } from "next/server"
import { db } from "@/lib/db/client"
import { handleDiagRaceGet } from "./get-handler"

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleDiagRaceGet(req, params.id, { db })
}
