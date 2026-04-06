'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { ChevronLeft, Target, Trophy, AlertCircle } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type DriverInfo = {
  id: string
  code: string
  firstName: string
  lastName: string
} | null

type PickEntry = {
  id: string
  raceId: string
  race: {
    id: string
    round: number
    name: string
    country: string
    type: string
    status: string
    scheduledStartUtc: string
  }
  tenthPlaceDriver: DriverInfo
  winnerDriver: DriverInfo
  dnfDriver: DriverInfo
  scoreBreakdown: {
    tenthPlaceScore: number
    winnerBonus: number
    dnfBonus: number
    totalScore: number
  } | null
}

type ProfileData = {
  user: {
    id: string
    publicUsername: string | null
    avatarUrl: string | null
    favoriteTeamSlug: string | null
  }
  picks: PickEntry[]
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function totalScore(picks: PickEntry[]): number {
  return picks.reduce((sum, p) => sum + (p.scoreBreakdown?.totalScore ?? 0), 0)
}

// ─────────────────────────────────────────────
// Pick row
// ─────────────────────────────────────────────

function PickRow({ pick }: { pick: PickEntry }) {
  const isScored = pick.scoreBreakdown !== null
  const isCompleted = pick.race.status === 'COMPLETED'

  return (
    <Link
      href={`/races/${pick.race.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-[var(--border)] hover:opacity-80 transition-opacity"
    >
      {/* Round */}
      <div className="w-8 shrink-0 text-center">
        <span className="text-xs font-bold text-text-tertiary">R{pick.race.round}</span>
      </div>

      {/* Race name + picks summary */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{pick.race.name}</p>
        {isScored || isCompleted ? (
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-text-tertiary">
              <Target className="w-3 h-3" />
              {pick.tenthPlaceDriver?.code ?? '—'}
            </span>
            <span className="flex items-center gap-1 text-xs text-text-tertiary">
              <Trophy className="w-3 h-3" />
              {pick.winnerDriver?.code ?? '—'}
            </span>
            <span className="flex items-center gap-1 text-xs text-text-tertiary">
              <AlertCircle className="w-3 h-3" />
              {pick.dnfDriver?.code ?? '—'}
            </span>
          </div>
        ) : (
          <p className="text-xs text-text-tertiary mt-0.5">Picks locked — awaiting results</p>
        )}
      </div>

      {/* Score */}
      <div className="shrink-0 text-right">
        {isScored ? (
          <span className={cn(
            'text-sm font-bold',
            (pick.scoreBreakdown?.totalScore ?? 0) > 0 ? 'text-[#30d158]' : 'text-text-tertiary',
          )}>
            +{pick.scoreBreakdown!.totalScore}
          </span>
        ) : (
          <span className="text-xs text-text-tertiary">—</span>
        )}
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function FriendProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { data, isLoading, error } = useSWR<ProfileData>(
    userId ? `/api/users/${userId}` : null,
    fetcher,
  )

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
        <div className="h-6 w-32 bg-surface-elevated rounded animate-pulse" />
        <div className="h-16 w-full bg-surface-elevated rounded-2xl animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-full bg-surface-elevated rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !data?.user) {
    return (
      <div className="px-4 pt-4 pb-6">
        <p className="text-sm text-text-secondary text-center py-12">Player not found.</p>
      </div>
    )
  }

  const { user, picks } = data
  const scored = picks.filter((p) => p.scoreBreakdown !== null)
  const total = totalScore(picks)

  return (
    <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
      {/* Back */}
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        Ranking
      </Link>

      {/* Profile header */}
      <div className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-surface border border-[var(--border)]">
        <Avatar
          src={user.avatarUrl}
          name={user.publicUsername ?? user.id}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-text-primary truncate">
            {user.publicUsername ?? 'Anonymous'}
          </p>
          <p className="text-xs text-text-tertiary mt-0.5">
            {scored.length} race{scored.length !== 1 ? 's' : ''} scored
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black text-[#30d158]">{total}</p>
          <p className="text-xs text-text-tertiary">pts</p>
        </div>
      </div>

      {/* Picks list */}
      {picks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest px-1">
            Picks this season
          </p>
          {picks.map((pick) => (
            <PickRow key={pick.id} pick={pick} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-[var(--border)] p-6 text-center">
          <p className="text-sm text-text-secondary">No picks yet this season.</p>
        </div>
      )}
    </div>
  )
}
