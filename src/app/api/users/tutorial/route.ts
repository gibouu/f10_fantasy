import { NextRequest } from 'next/server'

import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { dismissTutorial } from '@/lib/services/user.service'
import { handleTutorialPatch } from './patch-handler'

export async function PATCH(request: NextRequest) {
  return handleTutorialPatch(request, { auth, mobileAuth, dismissTutorial })
}
