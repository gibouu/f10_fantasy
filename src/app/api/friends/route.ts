import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  sendFriendRequest,
  getFriends,
  getPendingRequests,
  searchUsers,
} from '@/lib/services/friendship.service'
import { TEAMS } from '@/lib/f1/teams'
import type { TeamSlug } from '@/lib/f1/teams'

// ─────────────────────────────────────────────
// GET /api/friends
// Returns current friends + pending received + pending sent requests.
// Also handles GET /api/friends?search=q for the search endpoint.
// ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const { searchParams } = request.nextUrl
  const searchQuery = searchParams.get('q')

  // Delegate to search if ?q= param is present
  if (searchQuery !== null) {
    const results = await searchUsers(searchQuery, userId)
    return NextResponse.json(results)
  }

  // Full friends + pending data
  const [friends, pendingReceived] = await Promise.all([
    getFriends(userId),
    getPendingRequests(userId),
  ])

  // Pending sent — we need to query the DB directly since friendship.service
  // only exposes received. Use a lightweight query via the same service pattern.
  // For now we derive it from the DB client used in the service.
  const { db } = await import('@/lib/db/client')
  const sentRaw = await db.friendRequest.findMany({
    where: { requesterId: userId, status: 'PENDING' },
    select: {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
      createdAt: true,
      requester: { select: { publicUsername: true, image: true } },
      addressee: { select: { publicUsername: true, image: true, favoriteTeamSlug: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const pendingSent = sentRaw.map((r) => {
    const teamInfo = r.addressee.favoriteTeamSlug
      ? TEAMS[r.addressee.favoriteTeamSlug as TeamSlug]
      : null
    return {
      id: r.id,
      requesterId: r.requesterId,
      requesterUsername: r.requester.publicUsername,
      requesterAvatar: r.requester.image,
      addresseeId: r.addresseeId,
      addresseeUsername: r.addressee.publicUsername,
      addresseeAvatar: r.addressee.image,
      teamLogoUrl: teamInfo?.logoUrl ?? null,
      teamColor: teamInfo?.color ?? null,
      status: r.status as 'PENDING',
      createdAt: r.createdAt,
    }
  })

  return NextResponse.json({ friends, pendingReceived, pendingSent })
}

// ─────────────────────────────────────────────
// POST /api/friends
// Send a friend request: body { addresseeId: string }
// ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { addresseeId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const addresseeId = body.addresseeId
  if (typeof addresseeId !== 'string' || !addresseeId) {
    return NextResponse.json({ error: 'addresseeId is required' }, { status: 400 })
  }

  try {
    const friendRequest = await sendFriendRequest(userId, addresseeId)
    return NextResponse.json(friendRequest, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send friend request'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
