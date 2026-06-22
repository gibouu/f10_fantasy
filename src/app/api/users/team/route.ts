import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { readJsonObjectBody } from '@/lib/api/request-body'
import { setFavoriteTeam } from '@/lib/services/user.service'
import type { TeamSlug } from '@/lib/f1/teams'

export async function PATCH(req: Request) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsedBody = await readJsonObjectBody(req, {
    nonObjectMessage: 'slug is required',
  })
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const body = parsedBody.body

  if (
    !Object.prototype.hasOwnProperty.call(body, 'slug')
  ) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  // slug can be a valid TeamSlug string or null (to clear)
  const slugValue = body.slug
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
