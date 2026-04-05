'use client'

import * as React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { LockCountdown } from '@/components/race/LockCountdown'
import type { SerializedRaceSummary, SerializedPickSetWithScore, DriverSummary } from '@/types/domain'
import { RaceType, RaceStatus } from '@/types/domain'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type HeroVisualizationProps = {
  race: SerializedRaceSummary
  pick: SerializedPickSetWithScore | null
  /** Populated once race is completed */
  results?: {
    tenthPlace: { driver: DriverSummary; position: number }
    winner: { driver: DriverSummary }
    dnf: { driver: DriverSummary } | null
  }
  /** Live positions keyed by driverId — passed during LIVE races */
  livePositions?: Record<string, number>
  /** Entrant lookup used to resolve driver objects from pick IDs */
  entrants?: DriverSummary[]
  onLocked?: () => void
}

// ─────────────────────────────────────────────
// Driver bubble sub-component
// ─────────────────────────────────────────────

interface DriverBubbleProps {
  driver: DriverSummary | null
  size: number
  /** Show a dashed "pending" border instead of the team ring */
  pending?: boolean
  /** Green ring = pick matched actual result */
  matched?: boolean
  /** Show a "+" icon — for an empty pick slot */
  empty?: boolean
  /** Driver code label overlay */
  showCode?: boolean
}

function getInitials(d: DriverSummary): string {
  return d.code ?? (d.firstName[0] + d.lastName[0]).toUpperCase()
}

function DriverBubble({
  driver,
  size,
  pending,
  matched,
  empty,
  showCode = true,
}: DriverBubbleProps) {
  const ringColor = matched
    ? '#30d158'               // green — correct pick
    : driver?.constructor.color ?? 'transparent'

  const ringStyle: React.CSSProperties = pending
    ? { border: '2px dashed rgba(0,0,0,0.2)' }
    : { boxShadow: `0 0 0 2px ${ringColor}` }

  const fontSize = size >= 64 ? '10px' : '9px'

  return (
    <div
      className="relative rounded-full overflow-hidden shrink-0 bg-surface-elevated flex items-center justify-center"
      style={{ width: size, height: size, ...ringStyle }}
    >
      {empty ? (
        <span className="text-text-tertiary font-bold" style={{ fontSize: size * 0.35 }}>+</span>
      ) : driver?.photoUrl ? (
        <Image
          src={driver.photoUrl}
          alt={`${driver.firstName} ${driver.lastName}`}
          fill
          className="object-cover"
          
          sizes={`${size}px`}
        />
      ) : driver ? (
        <span
          className="font-bold text-text-primary"
          style={{ fontSize: size * 0.28 }}
        >
          {getInitials(driver)}
        </span>
      ) : (
        // Pending "?" placeholder
        <span className="font-bold text-text-tertiary" style={{ fontSize: size * 0.35 }}>?</span>
      )}

      {/* Driver code overlay */}
      {driver && showCode && (
        <span
          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 bg-black/70 text-white rounded-full px-1 font-bold leading-tight whitespace-nowrap"
          style={{ fontSize }}
        >
          {driver.code}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Column (actual + pick)
// ─────────────────────────────────────────────

interface SlotColumnProps {
  label: string
  resultDriver: DriverSummary | null
  pickDriver: DriverSummary | null | undefined
  resultSize: number
  pickSize: number
  raceStatus: RaceStatus
  hasPick: boolean
  matched: boolean
}

function SlotColumn({
  label,
  resultDriver,
  pickDriver,
  resultSize,
  pickSize,
  raceStatus,
  hasPick,
  matched,
}: SlotColumnProps) {
  const isLive = raceStatus === RaceStatus.LIVE
  const isCompleted = raceStatus === RaceStatus.COMPLETED
  const isPending = !isLive && !isCompleted

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Slot label */}
      <span className="text-[10px] font-bold text-text-tertiary tracking-widest uppercase mb-0.5">
        {label}
      </span>

      {/* Actual / live result bubble */}
      <DriverBubble
        driver={resultDriver}
        size={resultSize}
        pending={isPending}
        showCode={!!resultDriver}
      />

      {/* Divider arrow */}
      <span className="text-[10px] text-text-tertiary/50 leading-none">↓</span>

      {/* User pick bubble */}
      <DriverBubble
        driver={pickDriver ?? null}
        size={pickSize}
        matched={matched && isCompleted}
        empty={!hasPick}
        pending={!hasPick}
        showCode={!!pickDriver}
      />
      <span className="text-[9px] text-text-tertiary/70 leading-none">your pick</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function HeroVisualization({
  race,
  pick,
  results,
  livePositions,
  entrants = [],
  onLocked,
}: HeroVisualizationProps) {
  const isLocked = new Date() >= new Date(race.lockCutoffUtc)
  const isCompleted = race.status === RaceStatus.COMPLETED
  const isSprint = race.type === RaceType.SPRINT

  // Resolve pick drivers from entrant list
  const resolveDriver = (id: string | undefined | null): DriverSummary | null =>
    entrants.find((e) => e.id === id) ?? null

  const pickTenth = resolveDriver(pick?.tenthPlaceDriverId)
  const pickWinner = resolveDriver(pick?.winnerDriverId)
  const pickDnf = resolveDriver(pick?.dnfDriverId)

  // Build live result drivers from livePositions
  const liveDriverAtPos = (pos: number): DriverSummary | null => {
    if (!livePositions) return null
    const entry = Object.entries(livePositions).find(([, p]) => p === pos)
    if (!entry) return null
    return resolveDriver(entry[0])
  }

  // Slot: 10th place
  const actualTenth: DriverSummary | null =
    results?.tenthPlace?.driver ??
    (race.status === RaceStatus.LIVE ? liveDriverAtPos(10) : null)

  // Slot: winner
  const actualWinner: DriverSummary | null =
    results?.winner?.driver ??
    (race.status === RaceStatus.LIVE ? liveDriverAtPos(1) : null)

  // Slot: DNF
  const actualDnf: DriverSummary | null = results?.dnf?.driver ?? null

  // Match checks
  const tenthMatched = Boolean(
    isCompleted &&
      pick &&
      results &&
      pick.tenthPlaceDriverId === results.tenthPlace?.driver?.id,
  )
  const winnerMatched = Boolean(
    isCompleted &&
      pick &&
      results &&
      pick.winnerDriverId === results.winner?.driver?.id,
  )
  const dnfMatched = Boolean(
    isCompleted &&
      pick &&
      results &&
      results.dnf &&
      pick.dnfDriverId === results.dnf?.driver?.id,
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-surface rounded-2xl border border-[var(--border)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Round {race.round}
            </span>
            {isSprint && (
              <Badge variant="warning" size="sm">
                SPRINT
              </Badge>
            )}
          </div>
          <h2 className="text-base font-bold text-text-primary leading-tight">
            {race.name}
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">{race.circuitName}</p>
        </div>

        {/* Lock status */}
        <div className="shrink-0 pt-0.5">
          {isLocked || isCompleted ? (
            <Badge variant="accent" size="sm">
              Picks locked
            </Badge>
          ) : (
            <LockCountdown
              lockCutoffUtc={race.lockCutoffUtc}
              onLocked={onLocked}
            />
          )}
        </div>
      </div>

      {/* Live badge */}
      {race.status === RaceStatus.LIVE && (
        <div className="px-4 pb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            LIVE
          </span>
        </div>
      )}

      {/* Three-bubble cluster */}
      <div className="px-4 pb-5 pt-2 flex items-start justify-around gap-2">
        {/* Winner */}
        <SlotColumn
          label="Winner"
          resultDriver={actualWinner}
          pickDriver={pickWinner}
          resultSize={64}
          pickSize={44}
          raceStatus={race.status}
          hasPick={Boolean(pick?.winnerDriverId)}
          matched={winnerMatched}
        />

        {/* P10 — center, slightly larger */}
        <SlotColumn
          label="P10"
          resultDriver={actualTenth}
          pickDriver={pickTenth}
          resultSize={80}
          pickSize={52}
          raceStatus={race.status}
          hasPick={Boolean(pick?.tenthPlaceDriverId)}
          matched={tenthMatched}
        />

        {/* DNF */}
        <SlotColumn
          label="DNF"
          resultDriver={actualDnf}
          pickDriver={pickDnf}
          resultSize={64}
          pickSize={44}
          raceStatus={race.status}
          hasPick={Boolean(pick?.dnfDriverId)}
          matched={dnfMatched}
        />
      </div>
    </motion.div>
  )
}
