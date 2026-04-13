import * as React from 'react'
import { cn } from '@/lib/utils'
import type { DriverSummary, RaceResultRecord } from '@/types/domain'
import { ResultStatus } from '@/types/domain'

interface RaceResultsCardProps {
  results: RaceResultRecord[]
  entrants: DriverSummary[]
  raceType: 'MAIN' | 'SPRINT'
}

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

/** Points a P10 pick of this driver earns given their actual finishing position */
function p10Score(result: RaceResultRecord, raceType: 'MAIN' | 'SPRINT'): number {
  if (result.status !== ResultStatus.CLASSIFIED || result.position === null) return 0
  const delta = Math.abs(result.position - 10)
  return raceType === 'MAIN' ? (F1_POINTS[delta] ?? 0) : Math.max(0, 10 - delta)
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

  // Sort: classified by position first, then DNF/DNS/DSQ
  const sorted = [...results].sort((a, b) => {
    if (a.status === ResultStatus.CLASSIFIED && b.status === ResultStatus.CLASSIFIED) {
      return (a.position ?? 99) - (b.position ?? 99)
    }
    if (a.status === ResultStatus.CLASSIFIED) return -1
    if (b.status === ResultStatus.CLASSIFIED) return 1
    return 0
  })

  const maxP10Score = raceType === 'MAIN' ? 25 : 10
  const winnerBonus = raceType === 'MAIN' ? 5 : 2
  const dnfBonus = raceType === 'MAIN' ? 3 : 1

  return (
    <div className="rounded-2xl bg-surface border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Race Results</p>
        <div className="flex items-center gap-3 text-[10px] text-text-tertiary font-medium">
          <span>P10 pts</span>
          <span>W/DNF</span>
        </div>
      </div>

      {/* Results rows */}
      <div>
        {sorted.map((result, idx) => {
          const driver = entrantMap.get(result.driverId)
          const isClassified = result.status === ResultStatus.CLASSIFIED
          const isWinner = result.position === 1
          const isDnf = result.status === ResultStatus.DNF
          const isP10 = result.position === 10 && isClassified
          const pts = p10Score(result, raceType)

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
                <div className="min-w-0">
                  <span className={cn('text-sm font-semibold truncate block', isClassified ? 'text-text-primary' : 'text-text-tertiary')}>
                    {driver?.code ?? '???'}
                  </span>
                </div>
              </div>

              {/* P10 pick score */}
              <span
                className={cn(
                  'text-xs font-bold w-10 text-right shrink-0',
                  pts === maxP10Score ? 'text-[#C9A227]' : pts > 0 ? 'text-[#C9A227]/70' : 'text-text-tertiary/50',
                )}
              >
                {pts > 0 ? `+${pts}` : '—'}
              </span>

              {/* Winner / DNF bonus */}
              <div className="w-12 text-right shrink-0">
                {isWinner && (
                  <span className="text-[10px] font-bold text-[#30d158]">+{winnerBonus}W</span>
                )}
                {isDnf && (
                  <span className="text-[10px] font-bold text-accent">+{dnfBonus}D</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 border-t border-[var(--border)] flex flex-wrap gap-3 text-[10px] text-text-tertiary">
        <span><span className="font-bold text-[#30d158]">green</span> = P1 (+{winnerBonus}) · <span className="font-bold text-[#C9A227]">gold</span> = P10</span>
        <span>DNF = +{dnfBonus} bonus</span>
        <span>Max P10 = +{maxP10Score} pts</span>
      </div>
    </div>
  )
}
