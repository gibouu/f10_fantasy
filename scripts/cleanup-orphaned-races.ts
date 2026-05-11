/**
 * Reconcile UPCOMING races against OpenF1's current 2026 calendar.
 *
 * Many DB rows have stale openf1MeetingKey values pointing to prior-year
 * meetings (e.g. 1007-1023 range vs. OpenF1's actual 2026 keys 1279-1302).
 * So orphan detection must NOT rely on meetingKey match — it has to compare
 * by **race name** (and, for SPRINT rows, by whether any matching meeting
 * actually has a Sprint session in the active year).
 *
 * Pass 1 — orphan reconciliation: UPCOMING races (future start) where
 *   • MAIN: no OpenF1 meeting in the active year matches the DB name
 *           (case-insensitive substring, either direction), OR
 *   • SPRINT: the matching meeting (by "X Sprint" → "X Grand Prix") has
 *             no Sprint session in OpenF1 for the active year.
 *   are flipped to CANCELLED. Dry-run by default; --apply to commit.
 *
 * Pass 2 — drift audit (read-only): for matched DB races, prints any
 *   • meeting-level country mismatch
 *   • session-level date drift >24h (race row's openf1SessionKey vs
 *     the corresponding OpenF1 session.date_start), or stale
 *     openf1SessionKey not present in OpenF1
 *   No auto-fix.
 *
 * Refuses to act when OpenF1 returns fewer than 10 meetings (probable
 * upstream outage / partial response).
 *
 * Status is flipped, not deleted, because PickSet → Race cascades.
 * CANCELLED rows are silently hidden by both web RacesListClient and iOS
 * RacesListView (they match neither upcoming nor completed).
 *
 * Run:
 *   npx tsx scripts/cleanup-orphaned-races.ts          # dry-run
 *   npx tsx scripts/cleanup-orphaned-races.ts --apply  # commit Pass 1
 *
 * Reads DATABASE_URL from local .env / .env.local.
 *
 * Filed as part of https://github.com/gibouu/f10_fantasy/issues/17
 */
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local' })
loadDotenv({ path: '.env' })

import { db } from '@/lib/db/client'
import { getActiveSeason } from '@/lib/services/race.service'

interface OpenF1Meeting {
  meeting_key: number
  meeting_name: string
  country_name: string
  year: number
}

interface OpenF1Session {
  session_key: number
  meeting_key: number
  session_name: string
  date_start: string
}

const OPENF1_BASE = process.env.OPENF1_BASE_URL ?? 'https://api.openf1.org/v1'
const MIN_MEETINGS_THRESHOLD = 10
const DRIFT_TOLERANCE_MS = 24 * 60 * 60 * 1000

async function fetchOpenF1<T>(path: string): Promise<T[]> {
  const url = `${OPENF1_BASE}${path}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(
      `OpenF1 GET ${path} failed: ${res.status} ${res.statusText}`,
    )
  }
  return (await res.json()) as T[]
}

function nameMatches(a: string, b: string): boolean {
  const la = a.toLowerCase().trim()
  const lb = b.toLowerCase().trim()
  if (!la || !lb) return false
  return la === lb || la.includes(lb) || lb.includes(la)
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`)

  const season = await getActiveSeason()
  if (!season) {
    console.error('No active season found. Aborting.')
    process.exit(1)
  }
  console.log(`Active season: id=${season.id} year=${season.year}`)

  const meetings = await fetchOpenF1<OpenF1Meeting>(
    `/meetings?year=${season.year}`,
  )
  console.log(
    `OpenF1 returned ${meetings.length} meeting(s) for ${season.year}`,
  )
  if (meetings.length < MIN_MEETINGS_THRESHOLD) {
    console.error(
      `Refusing to proceed: OpenF1 returned fewer than ${MIN_MEETINGS_THRESHOLD} meetings.`,
    )
    console.error(
      'Probable upstream outage / partial response. Re-run later.',
    )
    process.exit(1)
  }

  const sprintSessions = await fetchOpenF1<OpenF1Session>(
    `/sessions?year=${season.year}&session_name=Sprint`,
  )
  const sprintMeetingKeys = new Set(sprintSessions.map((s) => s.meeting_key))
  console.log(
    `OpenF1 reports ${sprintSessions.length} Sprint session(s) across ${sprintMeetingKeys.size} meeting(s).`,
  )

  // For Pass 1 we don't need /sessions wholesale — only sprint sessions above
  // — but Pass 2 wants the full session set to verify openf1SessionKey.
  const allSessions = await fetchOpenF1<OpenF1Session>(
    `/sessions?year=${season.year}`,
  )
  const sessionByKey = new Map(allSessions.map((s) => [s.session_key, s]))

  const races = await db.race.findMany({
    where: { seasonId: season.id },
    select: {
      id: true,
      round: true,
      type: true,
      name: true,
      country: true,
      scheduledStartUtc: true,
      status: true,
      openf1MeetingKey: true,
      openf1SessionKey: true,
    },
    orderBy: [{ round: 'asc' }, { type: 'asc' }],
  })
  console.log(`DB has ${races.length} race row(s) for season ${season.year}`)

  // ─── Pass 1: orphan reconciliation ───
  console.log('\n=== Pass 1: orphan reconciliation (name-based) ===')
  const now = new Date()
  const upcoming = races.filter(
    (r) => r.status === 'UPCOMING' && r.scheduledStartUtc > now,
  )

  type Orphan = (typeof upcoming)[number] & { reason: string }
  const orphans: Orphan[] = []

  for (const r of upcoming) {
    if (r.type === 'MAIN') {
      const matched = meetings.filter((m) =>
        nameMatches(r.name, m.meeting_name),
      )
      if (matched.length === 0) {
        orphans.push({
          ...r,
          reason: `no OpenF1 meeting matches name "${r.name}"`,
        })
      }
    } else if (r.type === 'SPRINT') {
      const root = r.name.replace(/\s*Sprint\s*$/i, '').trim()
      if (!root) continue
      // Match DB sprint root against OpenF1 meeting name; e.g. "Canadian" vs
      // "Canadian Grand Prix" — both substring-match.
      const matched = meetings.filter((m) =>
        nameMatches(root, m.meeting_name),
      )
      if (matched.length === 0) {
        orphans.push({
          ...r,
          reason: `no OpenF1 meeting matches sprint root "${root}"`,
        })
        continue
      }
      const hasSprintSession = matched.some((m) =>
        sprintMeetingKeys.has(m.meeting_key),
      )
      if (!hasSprintSession) {
        orphans.push({
          ...r,
          reason: `OpenF1 has "${matched
            .map((m) => m.meeting_name)
            .join(', ')}" but no Sprint session for ${season.year}`,
        })
      }
    }
  }

  if (orphans.length === 0) {
    console.log('No orphan candidates found.')
  } else {
    console.log(`Found ${orphans.length} orphan candidate(s):`)
    for (const r of orphans) {
      console.log(
        `  ${r.id}  R${r.round} ${r.type}  ${r.name}  start=${r.scheduledStartUtc.toISOString()}`,
      )
      console.log(`    → ${r.reason}`)
    }
    if (apply) {
      const result = await db.race.updateMany({
        where: { id: { in: orphans.map((r) => r.id) } },
        data: { status: 'CANCELLED' },
      })
      console.log(`Applied: flipped ${result.count} race(s) → CANCELLED`)
    } else {
      console.log('(dry-run — re-run with --apply to commit)')
    }
  }

  // ─── Pass 2: drift audit (read-only) ───
  console.log('\n=== Pass 2: drift audit (read-only) ===')
  const orphanIds = new Set(orphans.map((r) => r.id))

  let driftCount = 0
  for (const r of races) {
    if (orphanIds.has(r.id)) continue // Pass 1 territory

    // Identify the matching OpenF1 meeting by name (not by stale meeting_key)
    let matchedMeeting: OpenF1Meeting | undefined
    if (r.type === 'MAIN') {
      matchedMeeting = meetings.find((m) => nameMatches(r.name, m.meeting_name))
    } else {
      const root = r.name.replace(/\s*Sprint\s*$/i, '').trim()
      matchedMeeting = meetings.find((m) => nameMatches(root, m.meeting_name))
    }
    if (!matchedMeeting) continue // already covered or unmatchable

    const issues: string[] = []

    if (
      r.openf1MeetingKey !== null &&
      r.openf1MeetingKey !== matchedMeeting.meeting_key
    ) {
      issues.push(
        `openf1MeetingKey ${r.openf1MeetingKey} is stale; OpenF1 has key ${matchedMeeting.meeting_key} for "${matchedMeeting.meeting_name}"`,
      )
    }
    if (
      r.country.toLowerCase() !== matchedMeeting.country_name.toLowerCase()
    ) {
      issues.push(
        `country "${r.country}" ≠ openf1 "${matchedMeeting.country_name}"`,
      )
    }

    if (r.openf1SessionKey !== null) {
      const session = sessionByKey.get(r.openf1SessionKey)
      if (!session) {
        issues.push(
          `openf1SessionKey ${r.openf1SessionKey} not in openf1 ${season.year} sessions`,
        )
      } else {
        const driftMs = Math.abs(
          r.scheduledStartUtc.getTime() -
            new Date(session.date_start).getTime(),
        )
        if (driftMs > DRIFT_TOLERANCE_MS) {
          const hours = (driftMs / 3_600_000).toFixed(1)
          issues.push(
            `start ${r.scheduledStartUtc.toISOString()} vs openf1 ${session.date_start} (drift ${hours}h)`,
          )
        }
      }
    }

    if (issues.length > 0) {
      driftCount += 1
      console.log(
        `  ${r.id}  R${r.round} ${r.type}  ${r.name}  status=${r.status}`,
      )
      for (const i of issues) console.log(`    - ${i}`)
    }
  }
  if (driftCount === 0) {
    console.log('No drift detected.')
  } else {
    console.log(
      `${driftCount} race(s) with drift (audit only — no auto-fix).`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
