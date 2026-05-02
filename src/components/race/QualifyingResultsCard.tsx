import * as React from 'react'
import { cn } from '@/lib/utils'
import type { DriverSummary } from '@/types/domain'

export interface QualifyingResultRow {
  driverId: string
  position: number
}

interface QualifyingResultsCardProps {
  results: QualifyingResultRow[]
  entrants: DriverSummary[]
  raceType: 'MAIN' | 'SPRINT'
}

export function QualifyingResultsCard({
  results,
  entrants,
  raceType,
}: QualifyingResultsCardProps) {
  if (results.length === 0) return null

  const entrantMap = new Map(entrants.map((e) => [e.id, e]))
  const sorted = [...results].sort((a, b) => a.position - b.position)
  const headerLabel =
    raceType === 'SPRINT' ? 'Sprint Qualifying Results' : 'Qualifying Results'

  return (
    <div className="rounded-2xl bg-surface border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <p className="text-sm font-semibold text-text-primary">{headerLabel}</p>
      </div>

      <div>
        {sorted.map((row) => {
          const driver = entrantMap.get(row.driverId)
          const isPole = row.position === 1
          return (
            <div
              key={row.driverId}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)]/50 last:border-0',
                isPole && 'bg-[#C9A22715]',
              )}
            >
              <span
                className={cn(
                  'w-7 text-center font-bold text-xs shrink-0',
                  isPole ? 'text-[#C9A227]' : 'text-text-tertiary',
                )}
              >
                P{row.position}
              </span>

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
                <span className="text-sm font-semibold truncate text-text-primary">
                  {driver?.code ?? '???'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
