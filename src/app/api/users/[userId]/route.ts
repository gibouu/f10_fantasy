import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getPicksForSeason } from '@/lib/services/pick.service'
import { getActiveSeason } from '@/lib/services/race.service'

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

  // Build a driver lookup so the UI can resolve driver codes
  const driverIds = new Set<string>()
  for (const pick of picks) {
    driverIds.add(pick.tenthPlaceDriverId)
    driverIds.add(pick.winnerDriverId)
    driverIds.add(pick.dnfDriverId)
  }

  // Raw query avoids Prisma type conflict with `constructor` relation key
  const drivers = await db.$queryRaw<
    Array<{ id: string; code: string; first_name: string; last_name: string }>
  >`SELECT id, code, first_name, last_name FROM "Driver" WHERE id = ANY(${Array.from(driverIds)}::text[])`

  const driverMap = new Map(
    drivers.map((d) => [d.id, { id: d.id, code: d.code, firstName: d.first_name, lastName: d.last_name }]),
  )

  // Serialize — dates to ISO strings so Next.js can send as JSON
  const serializedPicks = picks.map((ps) => ({
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
