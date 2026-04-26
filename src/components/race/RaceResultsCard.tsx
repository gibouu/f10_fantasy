import * as React from 'react'
import { cn } from '@/lib/utils'
import type { DriverSummary, RaceResultRecord } from '@/types/domain'
import { ResultStatus } from '@/types/domain'
import { getResultScoreGuide, getScoringCaps } from '@/lib/scoring/formula'

interface RaceResultsCardProps {
  results: RaceResultRecord[]
  entrants: DriverSummary[]
  raceType: 'MAIN' | 'SPRINT'
}

export function RaceResultsCard({ results, entrants, raceType }: RaceResultsCardProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-2xl bg-surface border border-[var(--border)] p-4">
        <p className="text-sm font-semibold text-text-primary mb-1">Race Results</p>
        <p className="text-sm text-text-secondary text-center py-4">Results not yet available</p>
      </div>
    )
  }

  const entrantMap = new Map(entrants.map((e) => [e.id, e]))

  const sorted = [...results].sort((a, b) => {
    if (a.status === ResultStatus.CLASSIFIED && b.status === ResultStatus.CLASSIFIED) {
      return (a.position ?? 99) - (b.position ?? 99)
    }
    if (a.status === ResultStatus.CLASSIFIED) return -1
    if (b.status === ResultStatus.CLASSIFIED) return 1
    return 0
  })

  const caps = getScoringCaps(raceType)

  return (
    <div className="rounded-2xl bg-surface border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Race Results</p>
        <span className="text-[10px] text-text-tertiary font-medium">pts</span>
      </div>

      {/* Results rows */}
      <div>
        {sorted.map((result) => {
          const driver = entrantMap.get(result.driverId)
          const isClassified = result.status === ResultStatus.CLASSIFIED
          const isWinner = isClassified && result.position === 1
          const isNonClassified = !isClassified
          const isP10 = result.position === 10 && isClassified
          const guide = result.scoreGuide ?? getResultScoreGuide(result, raceType)

          // Single column: W bonus, DNF bonus, or P10 pts
          let ptsLabel: string
          let ptsColor: string
          if (isWinner) {
            ptsLabel = `+${caps.winner}W`
            ptsColor = 'text-[#30d158]'
          } else if (isNonClassified) {
            ptsLabel = `+${guide.dnf}D`
            ptsColor = 'text-accent'
          } else if (guide.p10 > 0) {
            ptsLabel = `+${guide.p10}`
            ptsColor = isP10 ? 'text-[#C9A227]' : 'text-[#C9A227]/70'
          } else {
            ptsLabel = '—'
            ptsColor = 'text-text-tertiary/40'
          }

          return (
            <div
              key={result.driverId}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)]/50 last:border-0',
                isP10 && 'bg-[#C9A22715]',
                isWinner && 'bg-[#30d15815]',
              )}
            >
              {/* Position */}
              <span
                className={cn(
                  'w-7 text-center font-bold text-xs shrink-0',
                  isWinner ? 'text-[#30d158]' : isP10 ? 'text-[#C9A227]' : 'text-text-tertiary',
                )}
              >
                {isClassified ? `P${result.position}` : result.status}
              </span>

              {/* Driver photo + name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {driver?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={driver.photoUrl}
                    alt={driver.code}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                    style={{ backgroundColor: driver.constructor.color + '22' }}
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[9px] font-bold"
                    style={{ backgroundColor: driver?.constructor.color ?? '#666' }}
                  >
                    {driver?.code.slice(0, 2) ?? '??'}
                  </div>
                )}
                <span className={cn('text-sm font-semibold truncate', isClassified ? 'text-text-primary' : 'text-text-tertiary')}>
                  {driver?.code ?? '???'}
                </span>
              </div>

              {/* Single pts column */}
              <span className={cn('text-xs font-bold w-10 text-right shrink-0', ptsColor)}>
                {ptsLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
