import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { setFavoriteTeam } from '@/lib/services/user.service'
import type { TeamSlug } from '@/lib/f1/teams'

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  // slug can be a valid TeamSlug string or null (to clear)
  const slug: TeamSlug | null = body?.slug ?? null

  try {
    await setFavoriteTeam(session.user.id, slug)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update team' },
      { status: 400 },
    )
  }
}
