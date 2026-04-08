import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { resolveTeam } from '@/lib/f1/teams'
import { getPicksForSeason } from '@/lib/services/pick.service'
import { getActiveSeason, getRaceEntrants } from '@/lib/services/race.service'
import { resolvePickAgainstEntrants } from '@/lib/services/pick-resolution'

type SlotDriver = {
  id: string
  code: string
  firstName: string
  lastName: string
  photoUrl: string | null
  teamName: string
  teamColor: string
  logoUrl: string | null
}

function getScoreCaps(raceType: string) {
  return raceType === 'SPRINT'
    ? { p10: 10, winner: 2, dnf: 1 }
    : { p10: 25, winner: 5, dnf: 3 }
}

/**
 * GET /api/users/[userId]
 *
 * Public profile endpoint — returns username, avatar, and scored picks
 * for the active season. No auth required (picks are intentionally public
 * after race lock so friends can compare).
 */
export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const { userId } = params

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      publicUsername: true,
      image: true,
      favoriteTeamSlug: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const season = await getActiveSeason()
  if (!season) {
    return NextResponse.json({
      user: {
        id: user.id,
        publicUsername: user.publicUsername,
        avatarUrl: user.image,
        favoriteTeamSlug: user.favoriteTeamSlug,
      },
      picks: [],
    })
  }

  const picks = await getPicksForSeason(userId, season.id)
  const now = new Date()
  const visiblePicks = picks.filter((pick) => pick.race.lockCutoffUtc <= now)
  const raceIds = Array.from(new Set(visiblePicks.map((pick) => pick.raceId)))
  const entrantsByRace = new Map(
    await Promise.all(
      raceIds.map(async (raceId) => [raceId, await getRaceEntrants(raceId)] as const),
    ),
  )
  const resolvedPicks = visiblePicks.map((pick) =>
    resolvePickAgainstEntrants(pick, entrantsByRace.get(pick.raceId) ?? []),
  )

  // Build a driver lookup so the UI can resolve driver codes
  const driverIds = new Set<string>()
  for (const pick of resolvedPicks) {
    driverIds.add(pick.tenthPlaceDriverId)
    driverIds.add(pick.winnerDriverId)
    driverIds.add(pick.dnfDriverId)
  }

  // Raw query avoids Prisma type conflict with `constructor` relation key
  const drivers = await db.$queryRaw<
    Array<{
      id: string
      code: string
      first_name: string
      last_name: string
      photo_url: string | null
      constructor_name: string
      constructor_short_name: string
      constructor_color: string
    }>
  >`
    SELECT
      d.id,
      d.code,
      d."firstName" AS first_name,
      d."lastName" AS last_name,
      d."photoUrl" AS photo_url,
      c.name AS constructor_name,
      c."shortName" AS constructor_short_name,
      c.color AS constructor_color
    FROM "Driver" d
    JOIN "Constructor" c ON c.id = d."constructorId"
    WHERE d.id = ANY(${Array.from(driverIds)}::text[])
  `

  const driverMap = new Map(
    drivers.map((d) => {
      const team =
        resolveTeam(`${d.constructor_name} ${d.constructor_short_name}`) ??
        resolveTeam(d.constructor_name) ??
        resolveTeam(d.constructor_short_name)

      return [
        d.id,
        {
          id: d.id,
          code: d.code,
          firstName: d.first_name,
          lastName: d.last_name,
          photoUrl: d.photo_url,
          teamName: team?.name ?? d.constructor_name,
          teamColor: team?.color ?? d.constructor_color,
          logoUrl: team?.logoUrl ?? null,
        } satisfies SlotDriver,
      ]
    }),
  )

  // Serialize — dates to ISO strings so Next.js can send as JSON
  const serializedPicks = resolvedPicks.map((ps) => ({
    ...(() => {
      const caps = getScoreCaps(ps.race.type)
      const p10Score = ps.scoreBreakdown?.tenthPlaceScore ?? 0
      const winnerScore = ps.scoreBreakdown?.winnerBonus ?? 0
      const dnfScore = ps.scoreBreakdown?.dnfBonus ?? 0
      const isPending = ps.scoreBreakdown === null

      return {
        slotSummaries: {
          p10: {
            driver: driverMap.get(ps.tenthPlaceDriverId) ?? null,
            score: p10Score,
            status: isPending
              ? 'pending'
              : p10Score === caps.p10
              ? 'exact'
              : p10Score > 0
              ? 'partial'
              : 'miss',
          },
          winner: {
            driver: driverMap.get(ps.winnerDriverId) ?? null,
            score: winnerScore,
            status: isPending ? 'pending' : winnerScore === caps.winner ? 'correct' : 'miss',
          },
          dnf: {
            driver: driverMap.get(ps.dnfDriverId) ?? null,
            score: dnfScore,
            status: isPending ? 'pending' : dnfScore === caps.dnf ? 'correct' : 'miss',
          },
        },
      }
    })(),
    id: ps.id,
    raceId: ps.raceId,
    race: {
      id: ps.race.id,
      round: ps.race.round,
      name: ps.race.name,
      country: ps.race.country,
      type: ps.race.type,
      status: ps.race.status,
      scheduledStartUtc: ps.race.scheduledStartUtc.toISOString(),
    },
    tenthPlaceDriver: driverMap.get(ps.tenthPlaceDriverId) ?? null,
    winnerDriver: driverMap.get(ps.winnerDriverId) ?? null,
    dnfDriver: driverMap.get(ps.dnfDriverId) ?? null,
    scoreBreakdown: ps.scoreBreakdown
      ? {
          tenthPlaceScore: ps.scoreBreakdown.tenthPlaceScore,
          winnerBonus: ps.scoreBreakdown.winnerBonus,
          dnfBonus: ps.scoreBreakdown.dnfBonus,
          totalScore: ps.scoreBreakdown.totalScore,
        }
      : null,
  }))

  return NextResponse.json({
    user: {
      id: user.id,
      publicUsername: user.publicUsername,
      avatarUrl: user.image,
      favoriteTeamSlug: user.favoriteTeamSlug,
    },
    picks: serializedPicks,
  })
}
