import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { setFavoriteTeam } from '@/lib/services/user.service'
import { handleUsersTeamPatch } from './patch-handler'

export async function PATCH(req: Request) {
  return handleUsersTeamPatch(req, {
    auth,
    mobileAuth,
    setFavoriteTeam,
  })
}
