import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import {
  acceptFriendRequest,
  rejectFriendRequest,
} from '@/lib/services/friendship.service'
import { handleFriendRequestPatch } from './patch-handler'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleFriendRequestPatch(request, params, {
    auth,
    mobileAuth,
    acceptFriendRequest,
    rejectFriendRequest,
  })
}
