import * as React from 'react'
import { ArrowRight, Trophy, Target, AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SerializedPickSetWithScore, SerializedRaceSummary, DriverSummary } from '@/types/domain'
import { RaceStatus } from '@/types/domain'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type ResultRow = {
  driverId: string
  position: number | null
  status: string
}

interface PicksDisplayProps {
  pick: SerializedPickSetWithScore | null
  race: SerializedRaceSummary
  results?: ResultRow[]
  /** Optional driver list for resolving codes/names from IDs */
  entrants?: DriverSummary[]
}

// ─────────────────────────────────────────────
// Category row
// ─────────────────────────────────────────────

interface CategoryRowProps {
  icon: React.ReactNode
  label: string
  pickDriverId: string
  actualResult: ResultRow | null | undefined
  score: number
  maxScore: number
}

function CategoryRow({
  icon,
  label,
  pickDriverId,
  actualResult,
  score,
  maxScore,
}: CategoryRowProps) {
  const scored = score > 0

  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--border)] last:border-0">
      {/* Category icon + label */}
      <div className="flex items-center gap-2 w-20 shrink-0">
        <span className="text-text-tertiary">{icon}</span>
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>

      {/* Your pick — resolved to driver code by the parent */}
      <span className="text-sm font-semibold text-text-primary flex-1 truncate">
        {pickDriverId}
      </span>

      {/* Arrow */}
      <ArrowRight className="h-3.5 w-3.5 text-text-tertiary shrink-0" />

      {/* Actual result */}
      <span className="text-sm text-text-secondary w-12 truncate text-center">
        {actualResult
          ? actualResult.position !== null
            ? `P${actualResult.position}`
            : actualResult.status
          : '—'}
      </span>

      {/* Score chip */}
      <span
        className={cn(
          'text-sm font-bold w-10 text-right shrink-0',
          scored ? 'text-[#30d158]' : 'text-text-tertiary',
        )}
      >
        +{score}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function PicksDisplay({ pick, race, results, entrants = [] }: PicksDisplayProps) {
  /** Resolve a driverId to its display code (or fallback to truncated ID) */
  const resolveCode = (driverId: string): string => {
    const driver = entrants.find((e) => e.id === driverId)
    return driver?.code ?? driverId.slice(0, 6)
  }

  // No picks at all
  if (!pick) {
    return (
      <div className="rounded-2xl bg-surface border border-[var(--border)] p-4">
        <p className="text-sm text-text-secondary text-center py-4">
          You didn&apos;t make picks for this race.
        </p>
      </div>
    )
  }

  const isCompleted = race.status === RaceStatus.COMPLETED

  // Race not yet scored
  if (!isCompleted || !results) {
    return (
      <div className="rounded-2xl bg-surface border border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Your Picks</h3>
        <p className="text-sm text-text-secondary text-center py-2">
          Results pending...
        </p>
      </div>
    )
  }

  const breakdown = pick.scoreBreakdown

  // Find actual results for each pick
  const tenthResult = results.find((r) => r.driverId === pick.tenthPlaceDriverId)
  const winnerResult = results.find((r) => r.driverId === pick.winnerDriverId)
  const dnfResult = results.find((r) => r.driverId === pick.dnfDriverId)

  const totalScore = breakdown?.totalScore ?? 0

  return (
    <div className="rounded-2xl bg-surface border border-[var(--border)] p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text-primary">Your Picks</h3>

      {/* Category rows */}
      <div>
        <CategoryRow
          icon={<Target className="h-3.5 w-3.5" />}
          label="P10"
          pickDriverId={resolveCode(pick.tenthPlaceDriverId)}
          actualResult={tenthResult}
          score={breakdown?.tenthPlaceScore ?? 0}
          maxScore={race.type === 'MAIN' ? 25 : 10}
        />
        <CategoryRow
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Winner"
          pickDriverId={resolveCode(pick.winnerDriverId)}
          actualResult={winnerResult}
          score={breakdown?.winnerBonus ?? 0}
          maxScore={race.type === 'MAIN' ? 5 : 2}
        />
        <CategoryRow
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          label="DNF"
          pickDriverId={resolveCode(pick.dnfDriverId)}
          actualResult={dnfResult}
          score={breakdown?.dnfBonus ?? 0}
          maxScore={race.type === 'MAIN' ? 3 : 1}
        />
      </div>

      {/* Total score card */}
      <div className="rounded-xl bg-surface-elevated border border-[var(--border)] p-4 flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">Points this race</span>
        <span
          className={cn(
            'text-3xl font-bold',
            totalScore > 0 ? 'text-[#30d158]' : 'text-text-tertiary',
          )}
        >
          {totalScore}
        </span>
      </div>
    </div>
  )
}
