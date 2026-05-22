import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { setFavoriteTeam } from '@/lib/services/user.service'
import type { TeamSlug } from '@/lib/f1/teams'

export async function PATCH(req: Request) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !Object.prototype.hasOwnProperty.call(body, 'slug')
  ) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  // slug can be a valid TeamSlug string or null (to clear)
  const slugValue = (body as { slug: unknown }).slug
  if (slugValue !== null && typeof slugValue !== 'string') {
    return NextResponse.json({ error: 'slug must be a string or null' }, { status: 400 })
  }
  const slug: TeamSlug | null = slugValue === null ? null : (slugValue as TeamSlug)

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
