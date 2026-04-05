'use client'

import { useState } from 'react'
import { Lock, X, Check, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LockCountdown } from '@/components/race/LockCountdown'
import type { DriverSummary, SerializedPickSetData, SerializedRaceSummary } from '@/types/domain'

// ─── Types ───────────────────────────────────────────────────────────────────

type Slot = 'tenth' | 'winner' | 'dnf'

const SLOT_ORDER: Slot[] = ['winner', 'tenth', 'dnf'] // P1 left · P10 center · DNF right

const SLOT_META: Record<Slot, { label: string; title: string; pickSize: number; resultSize: number }> = {
  tenth:  { label: 'P10', title: 'Pick P10 Driver',   pickSize: 92,  resultSize: 50 },
  winner: { label: 'P1',  title: 'Pick Race Winner',  pickSize: 66,  resultSize: 38 },
  dnf:    { label: 'DNF', title: 'Pick DNF Driver',   pickSize: 66,  resultSize: 38 },
}

// ─── Pick bubble ─────────────────────────────────────────────────────────────

function PickBubble({
  size,
  driver,
  label,
  onClick,
  isLocked,
}: {
  size: number
  driver: DriverSummary | null
  label: string
  onClick?: () => void
  isLocked: boolean
}) {
  const hasPick = driver !== null

  const style: React.CSSProperties = { width: size, height: size }
  if (hasPick) {
    style.boxShadow = `0 0 0 3px ${driver.constructor.color}`
    style.backgroundColor = `${driver.constructor.color}18`
  }

  return (
    <button
      type="button"
      onClick={isLocked ? undefined : onClick}
      disabled={isLocked && !hasPick}
      style={style}
      className={cn(
        'rounded-full overflow-hidden flex flex-col items-center justify-center transition-all select-none shrink-0 relative',
        !hasPick && 'border-2 border-dashed border-[var(--border)] bg-surface-elevated',
        !isLocked && 'active:scale-95 cursor-pointer',
        isLocked && 'cursor-default',
      )}
    >
      {hasPick && driver?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={driver.photoUrl}
          alt={driver.code}
          className="absolute inset-0 w-full h-full object-cover"
          
        />
      ) : hasPick ? (
        <span
          className="font-black text-text-primary leading-none"
          style={{ fontSize: size * 0.26 }}
        >
          {driver!.code}
        </span>
      ) : (
        <>
          <span
            className="font-semibold text-text-tertiary leading-none"
            style={{ fontSize: size * 0.20 }}
          >
            {label}
          </span>
          {!isLocked && (
            <span
              className="text-text-tertiary/60 mt-0.5 leading-none"
              style={{ fontSize: size * 0.14 }}
            >
              tap to pick
            </span>
          )}
        </>
      )}
    </button>
  )
}

// ─── Result bubble ───────────────────────────────────────────────────────────

function ResultBubble({
  size,
  driver,
  label,
}: {
  size: number
  driver: DriverSummary | null
  label: string
}) {
  const style: React.CSSProperties = { width: size, height: size }
  if (driver) {
    style.boxShadow = `0 0 0 2px ${driver.constructor.color}`
  }

  return (
    <div
      style={style}
      className={cn(
        'rounded-full overflow-hidden flex items-center justify-center shrink-0 relative bg-surface-elevated',
        !driver && 'border-2 border-dashed border-[var(--border)]/60 bg-surface',
      )}
    >
      {driver?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={driver.photoUrl}
          alt={driver.code}
          className="absolute inset-0 w-full h-full object-cover"
          
        />
      ) : driver ? (
        <span
          className="font-bold text-text-primary leading-none"
          style={{ fontSize: size * 0.28 }}
        >
          {driver.code}
        </span>
      ) : (
        <span
          className="font-bold text-text-tertiary/50 leading-none"
          style={{ fontSize: size * 0.28 }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

// ─── Driver picker bottom sheet ───────────────────────────────────────────────

function DriverSheet({
  slot,
  entrants,
  disabledIds,
  selectedId,
  onSelect,
  onClose,
}: {
  slot: Slot
  entrants: DriverSummary[]
  disabledIds: Set<string>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
}) {
  const meta = SLOT_META[slot]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto bg-background rounded-t-[28px] animate-slide-up shadow-2xl">
        {/* Handle + header — rounded corners visible here */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 mb-1">
          <h2 className="font-bold text-text-primary text-lg">{meta.title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center transition-opacity active:opacity-60"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Thin divider */}
        <div className="h-px bg-[var(--border)] mx-4" />

        {/* Driver list — extra bottom padding for tab bar + safe area */}
        <div className="overflow-y-auto max-h-[60vh] px-4 pt-3 flex flex-col gap-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
          {entrants.map((driver) => {
            const isSelected = selectedId === driver.id
            const isDisabled = disabledIds.has(driver.id)

            return (
              <button
                key={driver.id}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  onSelect(isSelected ? null : driver.id)
                  if (!isSelected) onClose()
                }}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-left transition-all border',
                  isSelected
                    ? 'border-accent bg-accent/5'
                    : 'border-[var(--border)] bg-surface',
                  isDisabled && 'opacity-30 pointer-events-none',
                )}
              >
                {/* Team logo on team-color background */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 p-1.5 overflow-hidden"
                  style={{ backgroundColor: driver.constructor.color + '40' }}
                >
                  {driver.constructor.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={driver.constructor.logoUrl}
                      alt={driver.constructor.shortName}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-lg"
                      style={{ backgroundColor: driver.constructor.color }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-text-primary text-sm leading-tight">{driver.code}</p>
                  <p className="text-text-secondary text-xs truncate">
                    {driver.firstName} {driver.lastName}
                  </p>
                </div>
                <span className="text-text-tertiary text-xs font-mono shrink-0">#{driver.number}</span>
                {isSelected && <Check className="w-4 h-4 text-accent shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface PickHeroProps {
  race: SerializedRaceSummary
  entrants: DriverSummary[]
  existingPick: SerializedPickSetData | null
  isLocked: boolean
  // Actual race results — populated once race is scored
  actualTenth?: DriverSummary | null
  actualWinner?: DriverSummary | null
  actualDnf?: DriverSummary | null
}

export function PickHero({
  race,
  entrants,
  existingPick,
  isLocked,
  actualTenth = null,
  actualWinner = null,
  actualDnf = null,
}: PickHeroProps) {
  const [selected, setSelected] = useState<Record<Slot, string | null>>({
    tenth:  existingPick?.tenthPlaceDriverId  ?? null,
    winner: existingPick?.winnerDriverId      ?? null,
    dnf:    existingPick?.dnfDriverId         ?? null,
  })
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const driverById = Object.fromEntries(entrants.map((d) => [d.id, d]))

  const disabledForSlot = (slot: Slot): Set<string> =>
    new Set(
      SLOT_ORDER
        .filter((s) => s !== slot)
        .map((s) => selected[s])
        .filter(Boolean) as string[],
    )

  const actualBySlot: Record<Slot, DriverSummary | null> = {
    tenth: actualTenth,
    winner: actualWinner,
    dnf: actualDnf,
  }

  const allPicked = SLOT_ORDER.every((s) => selected[s] !== null)
  const canSave = allPicked && !isLocked && saveStatus !== 'loading'

  const handleSave = async () => {
    if (!canSave) return
    setSaveStatus('loading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raceId: race.id,
          tenthPlaceDriverId: selected.tenth,
          winnerDriverId: selected.winner,
          dnfDriverId: selected.dnf,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Failed to save picks')
      }

      setSaveStatus('success')
    } catch (err) {
      setSaveStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <>
      {/* Race card */}
      <div className="bg-surface rounded-3xl p-5 border border-[var(--border)]">
        {/* Race header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest mb-1">
              Round {race.round} · {race.type === 'SPRINT' ? 'Sprint' : 'Grand Prix'}
            </p>
            <h2 className="text-xl font-black text-text-primary leading-tight">{race.name}</h2>
            <p className="text-sm text-text-secondary mt-0.5">{race.circuitName}</p>
          </div>
          {isLocked ? (
            <div className="flex items-center gap-1.5 text-text-tertiary shrink-0 mt-0.5">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Locked</span>
            </div>
          ) : (
            <div className="shrink-0 mt-0.5">
              <LockCountdown lockCutoffUtc={race.lockCutoffUtc} onLocked={() => {}} />
            </div>
          )}
        </div>

        {/* Bubble row: P1 · P10 (center, large) · DNF */}
        <div className="flex items-end justify-around">
          {SLOT_ORDER.map((slot) => {
            const meta = SLOT_META[slot]
            const pickedId = selected[slot]
            const pickDriver = pickedId ? (driverById[pickedId] ?? null) : null
            const resultDriver = actualBySlot[slot]
            const isCenter = slot === 'tenth'

            return (
              <div
                key={slot}
                className={cn('flex flex-col items-center', isCenter && '-mb-1')}
              >
                {/* Pick bubble (large) */}
                <PickBubble
                  size={meta.pickSize}
                  driver={pickDriver}
                  label={meta.label}
                  onClick={() => setActiveSlot(slot)}
                  isLocked={isLocked}
                />

                {/* Result bubble (small) — sits below with a small gap */}
                <div className="mt-2 bg-background rounded-full p-[3px]">
                  <ResultBubble
                    size={meta.resultSize}
                    driver={resultDriver}
                    label={meta.label}
                  />
                </div>

                {/* Slot label */}
                <p className="text-[11px] font-semibold text-text-secondary mt-2">{meta.label}</p>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-dashed border-text-tertiary" />
            <span className="text-[11px] text-text-tertiary">Your pick</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-text-tertiary/50" />
            <span className="text-[11px] text-text-tertiary">Race result</span>
          </div>
        </div>
      </div>

      {/* Save / status */}
      {!isLocked && (
        <div className="flex flex-col gap-2 mt-1">
          {saveStatus === 'error' && errorMsg && (
            <p className="text-sm text-accent text-center">{errorMsg}</p>
          )}
          {saveStatus === 'success' && (
            <div className="flex items-center justify-center gap-1.5 text-success text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Picks saved!
            </div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="btn-primary w-full"
          >
            {saveStatus === 'loading'
              ? 'Saving…'
              : existingPick
              ? 'Update Picks'
              : 'Save Picks'}
          </button>
        </div>
      )}

      {/* Driver picker sheet */}
      {activeSlot && (
        <DriverSheet
          slot={activeSlot}
          entrants={entrants}
          disabledIds={disabledForSlot(activeSlot)}
          selectedId={selected[activeSlot]}
          onSelect={(id) => setSelected((prev) => ({ ...prev, [activeSlot!]: id }))}
          onClose={() => setActiveSlot(null)}
        />
      )}
    </>
  )
}
