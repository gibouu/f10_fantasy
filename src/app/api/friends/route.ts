import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import {
  sendFriendRequest,
  getFriends,
  getPendingRequests,
  getSentRequests,
  searchUsers,
} from '@/lib/services/friendship.service'
import { handleFriendsGet } from './get-handler'
import { handleFriendRequestPost } from './post-handler'

// ─────────────────────────────────────────────
// GET /api/friends
// Returns current friends + pending received + pending sent requests.
// Also handles GET /api/friends?search=q for the search endpoint.
// ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return handleFriendsGet(request, {
    auth,
    mobileAuth,
    searchUsers,
    getFriends,
    getPendingRequests,
    getSentRequests,
  })
}

// ─────────────────────────────────────────────
// POST /api/friends
// Send a friend request: body { addresseeId: string }
// ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  return handleFriendRequestPost(request, {
    auth,
    mobileAuth,
    sendFriendRequest,
  })
}
