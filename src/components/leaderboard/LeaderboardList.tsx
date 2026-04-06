'use client'

import * as React from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { UserPlus, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { LeaderboardRow } from '@/types/domain'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Scope = 'global' | 'friends'

interface CompletedRace {
  id: string
  round: number
  name: string
  type: string
}

interface LeaderboardListProps {
  rows: LeaderboardRow[]
  userId: string | null
  userRank: number | null
  userRow: LeaderboardRow | null
  seasonId: string
  seasonYear: number
  initialScope: Scope
  initialSort: string
  completedRaces: CompletedRace[]
  isGuest?: boolean
}

// ─────────────────────────────────────────────
// Medal colors
// ─────────────────────────────────────────────

const MEDAL_COLORS: Record<number, string> = {
  1: '#C9A227',
  2: '#9E9E9E',
  3: '#A0522D',
}

// ─────────────────────────────────────────────
// Row sub-component
// ─────────────────────────────────────────────

interface RowProps {
  row: LeaderboardRow
  isCurrentUser: boolean
  isPinned?: boolean
}

function LeaderboardRowItem({ row, isCurrentUser, isPinned }: RowProps) {
  const medalColor = MEDAL_COLORS[row.rank]

  return (
    <Link
      href={`/profile/${row.userId}`}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors hover:bg-surface-elevated',
        isCurrentUser && 'bg-accent/5 border border-accent/20',
        isPinned && 'mt-3 border-t-0',
      )}
    >
      {/* Rank */}
      <span
        className="text-sm font-black w-6 shrink-0 text-center tabular-nums"
        style={{
          color: medalColor ?? (isCurrentUser ? 'var(--accent)' : 'var(--text-tertiary)'),
        }}
      >
        {row.rank}
      </span>

      {/* Avatar — shows team logo if user has set a favourite team */}
      <Avatar
        src={row.avatarUrl}
        name={row.publicUsername ?? row.userId}
        size="sm"
        teamLogoUrl={row.teamLogoUrl}
        teamColor={row.teamColor}
      />

      {/* Username */}
      <span
        className={cn(
          'flex-1 text-sm truncate',
          isCurrentUser ? 'font-bold text-text-primary' : 'font-medium text-text-secondary',
        )}
      >
        {row.publicUsername ?? 'Anonymous'}
        {isCurrentUser && (
          <span className="ml-1.5 text-xs text-text-tertiary font-normal">you</span>
        )}
      </span>

      {/* Score */}
      <span
        className={cn(
          'text-sm font-bold tabular-nums shrink-0',
          isCurrentUser ? 'text-accent' : 'text-text-primary',
        )}
      >
        {row.totalScore} <span className="text-xs font-normal text-text-tertiary">pts</span>
      </span>
    </Link>
  )
}

// ─────────────────────────────────────────────
// Sort dropdown
// ─────────────────────────────────────────────

function SortDropdown({
  value,
  onChange,
  completedRaces,
  seasonYear,
}: {
  value: string
  onChange: (v: string) => void
  completedRaces: CompletedRace[]
  seasonYear: number
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-surface-elevated border border-[var(--border)]
                   text-text-primary text-sm font-medium
                   rounded-2xl px-4 py-2.5 pr-9 cursor-pointer
                   focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <option value="season">{seasonYear} Season (total)</option>
        {completedRaces.map((race) => (
          <option key={race.id} value={race.id}>
            R{race.round} · {race.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
    </div>
  )
}

// ─────────────────────────────────────────────
// SWR fetcher
// ─────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function LeaderboardList({
  rows: initialRows,
  userId,
  userRank,
  userRow,
  seasonId,
  seasonYear,
  initialScope,
  initialSort,
  completedRaces,
  isGuest = false,
}: LeaderboardListProps) {
  const [scope, setScope] = React.useState<Scope>(initialScope)
  const [sort, setSort] = React.useState<string>(initialSort)

  const shouldFetch =
    scope !== initialScope || sort !== initialSort

  const { data: fetchedData, isLoading } = useSWR<{
    rows: LeaderboardRow[]
    userRank: number | null
    userRow: LeaderboardRow | null
  }>(
    shouldFetch
      ? `/api/leaderboard?scope=${scope}&sort=${sort}&seasonId=${seasonId}`
      : null,
    fetcher,
  )

  const rows = shouldFetch ? (fetchedData?.rows ?? (isLoading ? [] : initialRows)) : initialRows
  const currentUserRank = shouldFetch ? (fetchedData?.userRank ?? null) : userRank
  const currentUserRow = shouldFetch ? (fetchedData?.userRow ?? null) : userRow

  const userInList = rows.some((r) => r.userId === userId)
  const showPinned = !userInList && currentUserRow !== null
  const isEmpty = scope === 'friends' && rows.length <= 1

  // Selected sort label for header
  const sortLabel =
    sort === 'season'
      ? `${seasonYear} Season`
      : completedRaces.find((r) => r.id === sort)?.name ?? 'Race'

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-text-primary tracking-tight">Ranking</h1>
        <p className="text-xs text-text-secondary mt-0.5">{sortLabel}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        {!isGuest && (
          <SegmentedControl
            options={[
              { value: 'global', label: 'Global' },
              { value: 'friends', label: 'Friends' },
            ]}
            value={scope}
            onChange={(v) => setScope(v as Scope)}
          />
        )}
        <SortDropdown
          value={sort}
          onChange={setSort}
          completedRaces={completedRaces}
          seasonYear={seasonYear}
        />
      </div>

      {/* No completed races state */}
      {completedRaces.length === 0 && sort !== 'season' && (
        <div className="rounded-2xl bg-surface border border-[var(--border)] p-6 text-center">
          <p className="text-sm text-text-secondary">No completed races yet</p>
        </div>
      )}

      {/* Friend CTA */}
      {isEmpty && (
        <div className="rounded-2xl bg-surface border border-[var(--border)] p-6 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-surface-elevated flex items-center justify-center">
            <UserPlus className="h-5 w-5 text-text-secondary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">No friends yet</p>
            <p className="text-xs text-text-secondary mt-1">
              Search for players below to add them as friends.
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && shouldFetch && (
        <div className="flex flex-col gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-2xl bg-surface-elevated animate-pulse" />
          ))}
        </div>
      )}

      {/* Leaderboard rows */}
      {!isEmpty && !isLoading && rows.length > 0 && (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <LeaderboardRowItem
              key={row.userId}
              row={row}
              isCurrentUser={row.userId === userId}
            />
          ))}

          {showPinned && currentUserRow && (
            <LeaderboardRowItem
              row={{ ...currentUserRow, rank: currentUserRank ?? currentUserRow.rank }}
              isCurrentUser
              isPinned
            />
          )}
        </div>
      )}

      {/* Empty state */}
      {!isEmpty && !isLoading && rows.length === 0 && (
        <div className="rounded-2xl bg-surface border border-[var(--border)] p-6 text-center">
          <p className="text-sm text-text-secondary">
            No scores yet — picks are scored after each race.
          </p>
        </div>
      )}
    </div>
  )
}
