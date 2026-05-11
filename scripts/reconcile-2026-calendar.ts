/**
 * Reconcile the active season's Race table against OpenF1, with F1's
 * official 2026 calendar as authoritative truth for which races exist.
 *
 * What this closes:
 *   - #19 — re-key stale openf1MeetingKey/SessionKey + fix dates on real races
 *   - #20 — dedupe Hungarian (R13/R14) and US GP (R19/R20) MAIN rows
 *   - #22 — insert missing rows (Monaco MAIN, Belgian MAIN, Mexico MAIN,
 *           British Sprint) and re-slot Spanish GP (Madrid) from Jun 1 to Sep 13
 *
 * F1-official truth model:
 *   OpenF1's /meetings?year=2026 returns 24 race meetings. F1 has officially
 *   dropped Bahrain GP and Saudi Arabian GP for 2026; OpenF1 still reports
 *   them. We hardcode that exclusion. Otherwise OpenF1 is trusted for
 *   meeting_key / session_key / date_start.
 *
 * Sprint weekend determination:
 *   A weekend is a sprint weekend iff OpenF1 has a session with
 *   session_name='Sprint' for that meeting. (User confirmed: 2026 sprint
 *   weekends are China, Miami, Canada, British, Dutch, Singapore.)
 *
 * Date-source rule (important):
 *   meeting.date_start = weekend Friday — DO NOT use as scheduledStartUtc.
 *   Use the Race session date_start for MAIN rows (Sunday).
 *   Use the Sprint session date_start for SPRINT rows (Saturday).
 *   lockCutoffUtc = scheduledStartUtc - 2min, matching sync-schedule convention.
 *
 * Winner-pick rule for duplicate DB rows:
 *   When multiple UPCOMING rows match a single expected race by name:
 *     1. Prefer the row with the most PickSet rows attached (preserve user data).
 *     2. Tiebreak: prefer the row whose scheduledStartUtc is closest to the
 *        OpenF1 session date_start.
 *     3. Tiebreak: prefer the row with the lowest round.
 *   The winner gets updated. Losers are flipped to CANCELLED. Their PickSet
 *   rows stay attached but are dead (see #23 for handling).
 *
 * What this script will NOT do:
 *   - Touch COMPLETED, LIVE, or CANCELLED rows. The architecture rule
 *     "Completed races are immutable" applies; CANCELLED rows are preserved
 *     because the user explicitly cancelled some (Bahrain/Saudi) and they
 *     must not resurrect.
 *   - Renumber rounds to F1's official 1-22 numbering. INSERTs go at
 *     max(round)+1 to avoid colliding with the [seasonId, round, type]
 *     unique key. Renumbering is a separate follow-up (#21 area or
 *     standalone).
 *
 * Safety:
 *   - Dry-run by default; --apply to commit.
 *   - Refuses if OpenF1 returns fewer than 10 meetings.
 *   - All writes in a single $transaction.
 *
 * Run:
 *   npx tsx scripts/reconcile-2026-calendar.ts          # dry-run
 *   npx tsx scripts/reconcile-2026-calendar.ts --apply  # commit
 */
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local' })
loadDotenv({ path: '.env' })

import { db } from '@/lib/db/client'
import { getActiveSeason } from '@/lib/services/race.service'

interface OpenF1Meeting {
  meeting_key: number
  meeting_name: string
  circuit_short_name: string
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
const LOCK_OFFSET_MS = 2 * 60_000

// F1 officially dropped these for 2026; OpenF1 still reports them. Source of
// truth: https://www.formula1.com/en/racing/2026.html
const F1_OFFICIAL_EXCLUSIONS = new Set<string>([
  'Bahrain Grand Prix',
  'Saudi Arabian Grand Prix',
])

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

function sprintNameFor(meetingName: string): string {
  // "Canadian Grand Prix" → "Canadian Sprint"
  // "Mexico City Grand Prix" → "Mexico City Sprint" (none in 2026 — defensive)
  return meetingName.replace(/Grand Prix$/i, 'Sprint').trim()
}

type RaceType = 'MAIN' | 'SPRINT'

interface ExpectedRace {
  type: RaceType
  expectedName: string
  meeting: OpenF1Meeting
  session: OpenF1Session
}

interface DbRace {
  id: string
  round: number
  type: string
  name: string
  circuitName: string
  country: string
  status: string
  scheduledStartUtc: Date
  openf1MeetingKey: number | null
  openf1SessionKey: number | null
  _count: { pickSets: number }
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
  if (meetings.length < MIN_MEETINGS_THRESHOLD) {
    console.error(
      `Refusing to proceed: OpenF1 returned fewer than ${MIN_MEETINGS_THRESHOLD} meetings.`,
    )
    process.exit(1)
  }
  console.log(`OpenF1 returned ${meetings.length} meeting(s) for ${season.year}`)

  const sessions = await fetchOpenF1<OpenF1Session>(
    `/sessions?year=${season.year}`,
  )
  const raceSessionByMeeting = new Map<number, OpenF1Session>()
  const sprintSessionByMeeting = new Map<number, OpenF1Session>()
  for (const s of sessions) {
    if (s.session_name === 'Race') raceSessionByMeeting.set(s.meeting_key, s)
    if (s.session_name === 'Sprint') sprintSessionByMeeting.set(s.meeting_key, s)
  }
  console.log(
    `OpenF1 sessions: ${raceSessionByMeeting.size} Race + ${sprintSessionByMeeting.size} Sprint`,
  )

  // Build the canonical "expected races" list for the active season.
  const expected: ExpectedRace[] = []
  for (const m of meetings) {
    if (F1_OFFICIAL_EXCLUSIONS.has(m.meeting_name)) continue
    const race = raceSessionByMeeting.get(m.meeting_key)
    if (race) {
      expected.push({
        type: 'MAIN',
        expectedName: m.meeting_name,
        meeting: m,
        session: race,
      })
    }
    const sprint = sprintSessionByMeeting.get(m.meeting_key)
    if (sprint) {
      expected.push({
        type: 'SPRINT',
        expectedName: sprintNameFor(m.meeting_name),
        meeting: m,
        session: sprint,
      })
    }
  }
  const exclusions = Array.from(F1_OFFICIAL_EXCLUSIONS).join(', ')
  console.log(
    `F1-official expected: ${expected.filter((e) => e.type === 'MAIN').length} MAIN + ${expected.filter((e) => e.type === 'SPRINT').length} SPRINT (${F1_OFFICIAL_EXCLUSIONS.size} excluded: ${exclusions})`,
  )

  // Pull every Race for the active season with PickSet counts.
  const dbRacesRaw = await db.race.findMany({
    where: { seasonId: season.id },
    select: {
      id: true,
      round: true,
      type: true,
      name: true,
      circuitName: true,
      country: true,
      status: true,
      scheduledStartUtc: true,
      openf1MeetingKey: true,
      openf1SessionKey: true,
      _count: { select: { pickSets: true } },
    },
    orderBy: [{ round: 'asc' }, { type: 'asc' }],
  })
  const dbRaces: DbRace[] = dbRacesRaw as unknown as DbRace[]
  console.log(`DB has ${dbRaces.length} race row(s) for season ${season.year}`)
  const maxRound = dbRaces.reduce((m, r) => Math.max(m, r.round), 0)
  let nextInsertRound = maxRound + 1

  // ─── Plan ───
  interface PlannedUpdate {
    id: string
    before: DbRace
    after: {
      name: string
      circuitName: string
      country: string
      scheduledStartUtc: Date
      lockCutoffUtc: Date
      openf1MeetingKey: number
      openf1SessionKey: number
    }
  }
  interface PlannedInsert {
    exp: ExpectedRace
    round: number
    scheduledStartUtc: Date
    lockCutoffUtc: Date
  }
  interface PlannedCancel {
    id: string
    before: DbRace
    reason: string
  }

  const updates: PlannedUpdate[] = []
  const inserts: PlannedInsert[] = []
  const cancels: PlannedCancel[] = []

  const completedLiveMatches: { exp: ExpectedRace; row: DbRace }[] = []

  for (const exp of expected) {
    // Candidates: any non-CANCELLED row, same type, name matches.
    // CANCELLED rows are intentionally excluded — those stay cancelled.
    const candidates = dbRaces.filter(
      (r) =>
        r.type === exp.type &&
        r.status !== 'CANCELLED' &&
        (nameMatches(r.name, exp.expectedName) ||
          nameMatches(r.name, exp.meeting.meeting_name)),
    )

    const expectedStart = new Date(exp.session.date_start)
    const expectedLock = new Date(expectedStart.getTime() - LOCK_OFFSET_MS)

    if (candidates.length === 0) {
      inserts.push({
        exp,
        round: nextInsertRound++,
        scheduledStartUtc: expectedStart,
        lockCutoffUtc: expectedLock,
      })
      continue
    }

    // If any candidate is COMPLETED or LIVE, the race already happened (or
    // is happening). Per architecture rule, leave it alone — don't update,
    // don't insert a duplicate. Record for reporting only.
    const completedOrLive = candidates.find(
      (c) => c.status === 'COMPLETED' || c.status === 'LIVE',
    )
    if (completedOrLive) {
      completedLiveMatches.push({ exp, row: completedOrLive })
      continue
    }

    // Rank candidates: pickSet count desc, then date proximity asc, then round asc.
    candidates.sort((a, b) => {
      if (b._count.pickSets !== a._count.pickSets) {
        return b._count.pickSets - a._count.pickSets
      }
      const aDelta = Math.abs(
        a.scheduledStartUtc.getTime() - expectedStart.getTime(),
      )
      const bDelta = Math.abs(
        b.scheduledStartUtc.getTime() - expectedStart.getTime(),
      )
      if (aDelta !== bDelta) return aDelta - bDelta
      return a.round - b.round
    })
    const winner = candidates[0]
    const losers = candidates.slice(1)

    updates.push({
      id: winner.id,
      before: winner,
      after: {
        name: exp.expectedName,
        circuitName: exp.meeting.circuit_short_name,
        country: exp.meeting.country_name,
        scheduledStartUtc: expectedStart,
        lockCutoffUtc: expectedLock,
        openf1MeetingKey: exp.meeting.meeting_key,
        openf1SessionKey: exp.session.session_key,
      },
    })

    for (const loser of losers) {
      cancels.push({
        id: loser.id,
        before: loser,
        reason: `duplicate of "${exp.expectedName}" — winner is ${winner.id} (round=${winner.round})`,
      })
    }
  }

  // Detect UPCOMING rows in DB that no expected race matched — these would be
  // orphans the previous cleanup script missed.
  const handledIds = new Set<string>([
    ...updates.map((u) => u.id),
    ...cancels.map((c) => c.id),
  ])
  const unmatched = dbRaces.filter(
    (r) => r.status === 'UPCOMING' && !handledIds.has(r.id),
  )

  // ─── Print plan ───
  console.log(`\n=== Plan ===`)
  console.log(
    `${updates.length} update(s), ${inserts.length} insert(s), ${cancels.length} cancellation(s), ${completedLiveMatches.length} COMPLETED/LIVE skipped, ${unmatched.length} unmatched UPCOMING (left alone)`,
  )

  if (updates.length > 0) {
    console.log('\n-- Updates --')
    for (const u of updates) {
      const startBefore = u.before.scheduledStartUtc.toISOString()
      const startAfter = u.after.scheduledStartUtc.toISOString()
      const dateChanged = startBefore !== startAfter
      const keyBefore = u.before.openf1MeetingKey ?? 'null'
      const keyAfter = u.after.openf1MeetingKey
      const nameBefore = u.before.name
      const nameAfter = u.after.name
      console.log(
        `  ${u.id}  R${u.before.round} ${u.before.type}  ${u.before.name}`,
      )
      if (nameBefore !== nameAfter) {
        console.log(`    name: "${nameBefore}" → "${nameAfter}"`)
      }
      if (dateChanged) {
        console.log(`    start: ${startBefore} → ${startAfter}`)
      }
      if (u.before.openf1MeetingKey !== keyAfter) {
        console.log(`    openf1MeetingKey: ${keyBefore} → ${keyAfter}`)
      }
      if (u.before.openf1SessionKey !== u.after.openf1SessionKey) {
        console.log(
          `    openf1SessionKey: ${u.before.openf1SessionKey ?? 'null'} → ${u.after.openf1SessionKey}`,
        )
      }
      if (
        u.before.country.toLowerCase() !== u.after.country.toLowerCase() ||
        u.before.circuitName.toLowerCase() !==
          u.after.circuitName.toLowerCase()
      ) {
        console.log(
          `    location: "${u.before.country} / ${u.before.circuitName}" → "${u.after.country} / ${u.after.circuitName}"`,
        )
      }
      console.log(`    pickSets: ${u.before._count.pickSets}`)
    }
  }

  if (inserts.length > 0) {
    console.log('\n-- Inserts --')
    for (const i of inserts) {
      console.log(
        `  R${i.round} ${i.exp.type}  ${i.exp.expectedName}  start=${i.scheduledStartUtc.toISOString()}  meetingKey=${i.exp.meeting.meeting_key}  sessionKey=${i.exp.session.session_key}`,
      )
    }
  }

  if (cancels.length > 0) {
    console.log('\n-- Cancellations (duplicates) --')
    for (const c of cancels) {
      console.log(
        `  ${c.id}  R${c.before.round} ${c.before.type}  ${c.before.name}  start=${c.before.scheduledStartUtc.toISOString()}  pickSets=${c.before._count.pickSets}`,
      )
      console.log(`    → ${c.reason}`)
    }
  }

  if (unmatched.length > 0) {
    console.log(
      '\n-- Unmatched UPCOMING (no F1-official match; not auto-cancelled — please review) --',
    )
    for (const r of unmatched) {
      console.log(
        `  ${r.id}  R${r.round} ${r.type}  ${r.name}  start=${r.scheduledStartUtc.toISOString()}  pickSets=${r._count.pickSets}`,
      )
    }
  }

  if (completedLiveMatches.length > 0) {
    console.log(
      '\n-- COMPLETED/LIVE matches (left untouched per immutability rule) --',
    )
    for (const m of completedLiveMatches) {
      console.log(
        `  ${m.row.id}  R${m.row.round} ${m.row.type}  ${m.row.name}  status=${m.row.status}  → F1: ${m.exp.expectedName}`,
      )
    }
  }

  if (!apply) {
    console.log('\n(dry-run — re-run with --apply to commit)')
    return
  }

  // ─── Apply ───
  if (updates.length === 0 && inserts.length === 0 && cancels.length === 0) {
    console.log('\nNothing to apply.')
    return
  }

  console.log('\nApplying...')
  await db.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.race.update({
        where: { id: u.id },
        data: {
          name: u.after.name,
          circuitName: u.after.circuitName,
          country: u.after.country,
          scheduledStartUtc: u.after.scheduledStartUtc,
          lockCutoffUtc: u.after.lockCutoffUtc,
          openf1MeetingKey: u.after.openf1MeetingKey,
          openf1SessionKey: u.after.openf1SessionKey,
        },
      })
    }
    for (const c of cancels) {
      await tx.race.update({
        where: { id: c.id },
        data: { status: 'CANCELLED' },
      })
    }
    for (const i of inserts) {
      await tx.race.create({
        data: {
          seasonId: season.id,
          round: i.round,
          name: i.exp.expectedName,
          circuitName: i.exp.meeting.circuit_short_name,
          country: i.exp.meeting.country_name,
          type: i.exp.type,
          scheduledStartUtc: i.scheduledStartUtc,
          lockCutoffUtc: i.lockCutoffUtc,
          status: 'UPCOMING',
          openf1MeetingKey: i.exp.meeting.meeting_key,
          openf1SessionKey: i.exp.session.session_key,
        },
      })
    }
  })
  console.log(
    `Applied: ${updates.length} update(s), ${inserts.length} insert(s), ${cancels.length} cancellation(s)`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
