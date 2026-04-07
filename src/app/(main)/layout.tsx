import { auth } from "@/auth"
import { db } from "@/lib/db/client"
import { TEAMS } from "@/lib/f1/teams"
import type { TeamSlug } from "@/lib/f1/teams"
import { UserAvatarMenu } from "./UserAvatarMenu"
import { TabBarLink } from "./TabBarLink"
import { Flag, Trophy } from "lucide-react"
import Link from "next/link"

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Fetch team slug so we can show team logo in the header avatar
  const userId = session?.user?.id
  const dbUser = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { favoriteTeamSlug: true },
      })
    : null
  const teamSlug = dbUser?.favoriteTeamSlug ?? null
  const teamInfo = teamSlug ? (TEAMS[teamSlug as TeamSlug] ?? null) : null

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 glass border-b border-black/[0.07] rounded-b-[22px]">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Wordmark */}
          <Link href="/races" className="flex items-baseline gap-1.5">
            <span className="text-accent font-black text-xl tracking-tight leading-none">
              FX
            </span>
            <span className="text-text-secondary font-medium text-sm tracking-widest uppercase">
              Racing
            </span>
          </Link>

          {/* User menu — client component */}
          <UserAvatarMenu
            user={session?.user ?? null}
            teamLogoUrl={teamInfo?.logoUrl ?? null}
            teamColor={teamInfo?.color ?? null}
          />
        </div>
      </header>

      {/* ── Scrollable content area ────────────────────────────────────── */}
      {/*
       * pb-24 gives clearance for the fixed tab bar (56px) plus extra breathing
       * room so content doesn't sit flush against the bottom nav.
       */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* ── Fixed bottom tab bar ───────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-black/[0.07]"
        aria-label="Main navigation"
      >
        <div className="max-w-[430px] mx-auto flex">
          <TabBarLink
            href="/races"
            label="Races"
            icon={<Flag className="w-5 h-5" />}
          />
          <TabBarLink
            href="/leaderboard"
            label="Ranking"
            icon={<Trophy className="w-5 h-5" />}
          />
        </div>
      </nav>
    </div>
  )
}
