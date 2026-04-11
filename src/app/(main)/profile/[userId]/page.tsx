'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ChevronLeft } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { TEAMS } from '@/lib/f1/teams'
import type { TeamSlug } from '@/lib/f1/teams'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type SlotDriver = {
  id: string
  code: string
  firstName: string
  lastName: string
  photoUrl: string | null
  teamName: string
  teamColor: string
  logoUrl: string | null
} | null

type P10Status = 'pending' | 'exact' | 'partial' | 'miss'
type WinnerDnfStatus = 'pending' | 'correct' | 'miss'

type SlotSummary = {
  driver: SlotDriver
  score: number
}

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
  scoreBreakdown: {
    tenthPlaceScore: number
    winnerBonus: number
    dnfBonus: number
    totalScore: number
  } | null
  slotSummaries: {
    p10: SlotSummary & { status: P10Status }
    winner: SlotSummary & { status: WinnerDnfStatus }
    dnf: SlotSummary & { status: WinnerDnfStatus }
  }
}

type ProfileData = {
  user: {
    id: string
    publicUsername: string | null
    avatarUrl: string | null
    favoriteTeamSlug: string | null
  }
  picks: PickEntry[]
  canViewPicks: boolean
}

type DetailState = {
  title: string
  driver: SlotDriver
} | null

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function totalScore(picks: PickEntry[]): number {
  return picks.reduce((sum, p) => sum + (p.scoreBreakdown?.totalScore ?? 0), 0)
}

function formatBadge(score: number): string {
  return `+${score}`
}

function BubbleBadge({
  score,
  tone,
  isHit,
}: {
  score: number
  tone: 'gold' | 'green' | 'red'
  isHit: boolean
}) {
  if (isHit) {
    const toneClass =
      tone === 'gold'
        ? 'bg-[#C9A227] text-black'
        : tone === 'green'
        ? 'bg-[#30d158] text-black'
        : 'bg-[#ff453a] text-white'

    return (
      <span
        className={cn(
          'absolute -bottom-1 -right-1 flex min-h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-black shadow-md',
          toneClass,
        )}
      >
        {formatBadge(score)}
      </span>
    )
  }

  return (
    <span className="absolute -bottom-1 -right-1 rounded-full border border-[var(--border)] bg-surface px-1.5 py-0.5 text-[10px] font-bold text-text-secondary shadow-sm">
      {formatBadge(score)}
    </span>
  )
}

function PickBubble({
  label,
  slot,
  size,
  showBadge,
  hitTone,
  onOpen,
}: {
  label: string
  slot: PickEntry['slotSummaries']['p10'] | PickEntry['slotSummaries']['winner'] | PickEntry['slotSummaries']['dnf']
  size: 'sm' | 'lg'
  showBadge: boolean
  hitTone: 'gold' | 'green' | 'red'
  onOpen: () => void
}) {
  const driver = slot.driver
  const bubbleSize = size === 'lg' ? 'h-16 w-16' : 'h-14 w-14'
  const codeSize = size === 'lg' ? 'text-sm' : 'text-xs'
  const isHit = slot.status === 'exact' || slot.status === 'correct'

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className="flex flex-col items-center gap-1"
      aria-label={`${label} pick details`}
    >
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-full bg-surface-elevated text-text-primary transition-transform active:scale-95',
          bubbleSize,
        )}
        style={{
          boxShadow: `0 0 0 2px ${driver?.teamColor ?? 'rgba(255,255,255,0.12)'}`,
        }}
      >
        {driver?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.photoUrl}
            alt={driver.code}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className={cn('font-black tracking-wide', codeSize)}>
            {driver?.code ?? '—'}
          </span>
        )}
        {showBadge && slot.status !== 'pending' ? (
          <BubbleBadge score={slot.score} tone={hitTone} isHit={isHit} />
        ) : null}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
        {label}
      </span>
    </button>
  )
}

function PickRow({
  pick,
  onOpenDetail,
}: {
  pick: PickEntry
  onOpenDetail: (detail: DetailState) => void
}) {
  const router = useRouter()
  const isPastRace = pick.race.status === 'COMPLETED' && pick.scoreBreakdown !== null

  const openDetail = (title: string, driver: SlotDriver) => {
    onOpenDetail({ title, driver })
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/races/${pick.race.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          router.push(`/races/${pick.race.id}`)
        }
      }}
      className="rounded-2xl border border-[var(--border)] bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated/70"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
            R{pick.race.round}
          </p>
          <p className="truncate text-sm font-semibold text-text-primary">{pick.race.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-text-tertiary">
            {pick.race.status === 'COMPLETED' ? 'Past race' : 'Upcoming / locked'}
          </p>
          <p className="text-sm font-bold text-text-primary">
            {pick.scoreBreakdown ? formatBadge(pick.scoreBreakdown.totalScore) : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <PickBubble
          label="P1"
          slot={pick.slotSummaries.winner}
          size="sm"
          showBadge={isPastRace}
          hitTone="green"
          onOpen={() => openDetail('Winner', pick.slotSummaries.winner.driver)}
        />
        <PickBubble
          label="P10"
          slot={pick.slotSummaries.p10}
          size="lg"
          showBadge={isPastRace}
          hitTone="gold"
          onOpen={() => openDetail('P10', pick.slotSummaries.p10.driver)}
        />
        <PickBubble
          label="DNF"
          slot={pick.slotSummaries.dnf}
          size="sm"
          showBadge={isPastRace}
          hitTone="red"
          onOpen={() => openDetail('DNF', pick.slotSummaries.dnf.driver)}
        />
      </div>
    </div>
  )
}

function Section({
  title,
  picks,
  onOpenDetail,
}: {
  title: string
  picks: PickEntry[]
  onOpenDetail: (detail: DetailState) => void
}) {
  if (picks.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
        {title}
      </p>
      {picks.map((pick) => (
        <PickRow key={pick.id} pick={pick} onOpenDetail={onOpenDetail} />
      ))}
    </div>
  )
}

export default function FriendProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { data, isLoading, error } = useSWR<ProfileData>(
    userId ? `/api/users/${userId}` : null,
    fetcher,
  )
  const [selectedDetail, setSelectedDetail] = React.useState<DetailState>(null)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
        <div className="h-6 w-32 animate-pulse rounded bg-surface-elevated" />
        <div className="h-16 w-full animate-pulse rounded-2xl bg-surface-elevated" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 w-full animate-pulse rounded-2xl bg-surface-elevated" />
        ))}
      </div>
    )
  }

  if (error || !data?.user) {
    return (
      <div className="px-4 pb-6 pt-4">
        <p className="py-12 text-center text-sm text-text-secondary">Player not found.</p>
      </div>
    )
  }

  const { user, picks, canViewPicks } = data
  const scored = picks.filter((p) => p.scoreBreakdown !== null)
  const total = totalScore(picks)
  const upcomingLocked = picks.filter((p) => p.race.status !== 'COMPLETED')
  const pastRaces = picks.filter((p) => p.race.status === 'COMPLETED')

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pb-6 pt-3">
        <Link
          href="/leaderboard"
          className="-ml-1 inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          Ranking
        </Link>

        <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-surface px-4 py-4">
          <Avatar
            src={null}
            name={user.publicUsername ?? user.id}
            size="lg"
            teamLogoUrl={user.favoriteTeamSlug ? (TEAMS[user.favoriteTeamSlug as TeamSlug]?.logoUrl ?? null) : null}
            teamColor={user.favoriteTeamSlug ? (TEAMS[user.favoriteTeamSlug as TeamSlug]?.color ?? null) : null}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-text-primary">
              {user.publicUsername ?? 'Anonymous'}
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {scored.length} race{scored.length !== 1 ? 's' : ''} scored
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-black text-[#30d158]">{total}</p>
            <p className="text-xs text-text-tertiary">pts</p>
          </div>
        </div>

        {!canViewPicks ? (
          <div className="rounded-2xl border border-[var(--border)] bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-text-primary mb-1">Picks are private</p>
            <p className="text-xs text-text-secondary">
              Add {user.publicUsername ?? 'this player'} as a friend to see their picks.
            </p>
          </div>
        ) : picks.length > 0 ? (
          <div className="flex flex-col gap-4">
            <Section
              title="Upcoming / Locked"
              picks={upcomingLocked}
              onOpenDetail={setSelectedDetail}
            />
            <Section
              title="Past Races"
              picks={pastRaces}
              onOpenDetail={setSelectedDetail}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-surface p-6 text-center">
            <p className="text-sm text-text-secondary">No picks yet this season.</p>
          </div>
        )}
      </div>

      <Sheet open={selectedDetail !== null} onOpenChange={(open) => !open && setSelectedDetail(null)}>
        <SheetContent side="bottom" className="rounded-t-[28px] border-[var(--border)] bg-surface px-5 pb-8 pt-10">
          <SheetHeader className="text-left">
            <SheetTitle className="text-text-primary">
              {selectedDetail?.title} pick
            </SheetTitle>
            <SheetDescription className="text-text-secondary">
              Driver and team details
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-surface-elevated p-4">
            {selectedDetail?.driver ? (
              <div className="flex items-center gap-3">
                <div
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface"
                  style={{
                    boxShadow: `0 0 0 2px ${selectedDetail.driver.teamColor}`,
                  }}
                >
                  {selectedDetail.driver.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedDetail.driver.photoUrl}
                      alt={selectedDetail.driver.code}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-black text-text-primary">
                      {selectedDetail.driver.code}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-base font-bold text-text-primary">
                    {selectedDetail.driver.firstName} {selectedDetail.driver.lastName}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">{selectedDetail.driver.teamName}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">No driver selected.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
