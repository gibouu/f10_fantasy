import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { TeamPicker } from './TeamPicker'
import { UsernameChangeForm } from './UsernameChangeForm'
import { TEAM_LIST } from '@/lib/f1/teams'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/signin')

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      favoriteTeamSlug: true,
      publicUsername: true,
      usernameSet: true,
      usernameChangeUsed: true,
    },
  })

  const canChangeUsername = user?.usernameSet && !user?.usernameChangeUsed

  return (
    <div className="max-w-[430px] mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black text-text-primary tracking-tight">Profile</h1>
        {user?.publicUsername && (
          <p className="text-xs text-text-secondary mt-0.5">@{user.publicUsername}</p>
        )}
      </div>

      {/* Username change — one-time, only if not used yet */}
      {canChangeUsername && (
        <div>
          <p className="text-sm font-semibold text-text-primary mb-1">Change username</p>
          <UsernameChangeForm currentUsername={user!.publicUsername!} />
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-text-primary mb-1">Your team</p>
        <p className="text-xs text-text-secondary mb-4">
          Your favourite team&apos;s logo will appear next to your name on the leaderboard and as your profile picture.
        </p>
        <TeamPicker
          teams={TEAM_LIST}
          initialSlug={user?.favoriteTeamSlug ?? null}
        />
      </div>
    </div>
  )
}
