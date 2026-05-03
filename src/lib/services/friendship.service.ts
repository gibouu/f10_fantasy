/**
 * Friend request management service.
 *
 * Friendship is bidirectional: when a request is accepted, either party can
 * appear as requester or addressee in the FriendRequest table.
 */

import { db } from '@/lib/db/client'
import type { FriendRequestData } from '@/types/domain'
import { FriendRequestStatus } from '@/types/domain'
import { TEAMS } from '@/lib/f1/teams'
import type { TeamSlug } from '@/lib/f1/teams'

// ─────────────────────────────────────────────
// Internal mappers
// ─────────────────────────────────────────────

function mapFriendRequest(fr: {
  id: string
  requesterId: string
  addresseeId: string
  status: string
  createdAt: Date
  requester: { publicUsername: string | null; image: string | null }
}): FriendRequestData {
  return {
    id: fr.id,
    requesterId: fr.requesterId,
    requesterUsername: fr.requester.publicUsername,
    requesterAvatar: fr.requester.image,
    addresseeId: fr.addresseeId,
    status: fr.status as FriendRequestStatus,
    createdAt: fr.createdAt,
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Search for users by publicUsername (partial, case-insensitive).
 *
 * Excludes:
 *   - The current user themselves
 *   - Users with an existing accepted friendship
 *   - Users with a pending request in either direction
 *
 * @returns Up to 10 matching user summaries
 */
export async function searchUsers(
  query: string,
  currentUserId: string,
): Promise<Array<{ id: string; publicUsername: string | null; avatarUrl: string | null; teamLogoUrl: string | null; teamColor: string | null }>> {
  // Find user IDs that already have a relationship with the current user
  const existingRelationships = await db.friendRequest.findMany({
    where: {
      OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
      status: { in: ['PENDING', 'ACCEPTED'] },
    },
    select: { requesterId: true, addresseeId: true },
  })

  const excludedIds = new Set<string>([currentUserId])
  for (const rel of existingRelationships) {
    excludedIds.add(rel.requesterId)
    excludedIds.add(rel.addresseeId)
  }

  const users = await db.user.findMany({
    where: {
      id: { notIn: Array.from(excludedIds) },
      publicUsername: {
        contains: query,
        mode: 'insensitive',
      },
    },
    select: { id: true, publicUsername: true, image: true, favoriteTeamSlug: true },
    take: 10,
  })

  return users.map((u) => {
    const teamInfo = u.favoriteTeamSlug ? (TEAMS[u.favoriteTeamSlug as TeamSlug] ?? null) : null
    return {
      id: u.id,
      publicUsername: u.publicUsername,
      avatarUrl: u.image,
      teamLogoUrl: teamInfo?.logoUrl ?? null,
      teamColor: teamInfo?.color ?? null,
    }
  })
}

/**
 * Send a friend request from `requesterId` to `addresseeId`.
 *
 * @throws If: self-request, a request already exists (either direction), or they are already friends
 */
export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
): Promise<FriendRequestData> {
  if (requesterId === addresseeId) {
    throw new Error('You cannot send a friend request to yourself')
  }

  // Serialize concurrent A→B and B→A submissions on the *unordered* user-pair
  // via a Postgres advisory lock. Without this, both pass the existence check
  // and both inserts succeed (the unique index is on the directional pair).
  const [a, b] = [requesterId, addresseeId].sort()
  const pairKey = `friend-pair:${a}:${b}`

  return db.$transaction(async (tx) => {
    // pg_advisory_xact_lock returns void; cast to text so Prisma's $queryRaw
    // can deserialize the result row.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${pairKey}))::text`

    const existing = await tx.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
      select: { id: true, status: true },
    })

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new Error('You are already friends with this user')
      }
      throw new Error('A friend request already exists between these users')
    }

    const fr = await tx.friendRequest.create({
      data: {
        requesterId,
        addresseeId,
        status: 'PENDING',
      },
      include: {
        requester: { select: { publicUsername: true, image: true } },
      },
    })

    return mapFriendRequest(fr)
  })
}

/**
 * Accept a friend request. Only the addressee can accept.
 *
 * @throws If the request is not found or the user is not the addressee
 */
export async function acceptFriendRequest(
  requestId: string,
  userId: string,
): Promise<void> {
  const fr = await db.friendRequest.findUnique({
    where: { id: requestId },
    select: { addresseeId: true, status: true },
  })

  if (!fr) {
    throw new Error(`Friend request not found: ${requestId}`)
  }

  if (fr.addresseeId !== userId) {
    throw new Error('Only the addressee can accept a friend request')
  }

  if (fr.status !== 'PENDING') {
    throw new Error(`Friend request is already ${fr.status}`)
  }

  await db.friendRequest.update({
    where: { id: requestId },
    data: { status: 'ACCEPTED' },
  })
}

/**
 * Reject or cancel a friend request.
 *
 * Both the addressee (to reject) and the requester (to cancel) may call this.
 *
 * @throws If the request is not found or the user is not a party to it
 */
export async function rejectFriendRequest(
  requestId: string,
  userId: string,
): Promise<void> {
  const fr = await db.friendRequest.findUnique({
    where: { id: requestId },
    select: { requesterId: true, addresseeId: true, status: true },
  })

  if (!fr) {
    throw new Error(`Friend request not found: ${requestId}`)
  }

  if (fr.requesterId !== userId && fr.addresseeId !== userId) {
    throw new Error('You are not a party to this friend request')
  }

  if (fr.status === 'ACCEPTED') {
    throw new Error('Cannot reject an already accepted friend request')
  }

  await db.friendRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED' },
  })
}

/**
 * Get all pending (received) friend requests for a user.
 * Does NOT include requests the user sent.
 */
export async function getPendingRequests(
  userId: string,
): Promise<FriendRequestData[]> {
  const requests = await db.friendRequest.findMany({
    where: {
      addresseeId: userId,
      status: 'PENDING',
    },
    include: {
      requester: { select: { publicUsername: true, image: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return requests.map(mapFriendRequest)
}

/**
 * Get the accepted friends list for a user.
 * Returns the friend's profile (the "other party" in the relationship).
 */
export async function getFriends(
  userId: string,
): Promise<Array<{ id: string; publicUsername: string | null; avatarUrl: string | null; teamLogoUrl: string | null; teamColor: string | null }>> {
  const accepted = await db.friendRequest.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: { select: { id: true, publicUsername: true, image: true, favoriteTeamSlug: true } },
      addressee: { select: { id: true, publicUsername: true, image: true, favoriteTeamSlug: true } },
    },
  })

  return accepted.map((fr) => {
    const friend = fr.requesterId === userId ? fr.addressee : fr.requester
    const teamInfo = friend.favoriteTeamSlug ? (TEAMS[friend.favoriteTeamSlug as TeamSlug] ?? null) : null
    return {
      id: friend.id,
      publicUsername: friend.publicUsername,
      avatarUrl: friend.image,
      teamLogoUrl: teamInfo?.logoUrl ?? null,
      teamColor: teamInfo?.color ?? null,
    }
  })
}
