'use client'

import * as React from 'react'
import { Lock, CheckCircle2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { DriverSummary, SerializedPickSetData } from '@/types/domain'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** RaceSummary with Date fields serialized to ISO strings for client component safety */
export type SerializedRace = {
  id: string
  seasonId: string
  round: number
  name: string
  circuitName: string
  country: string
  type: 'MAIN' | 'SPRINT'
  scheduledStartUtc: string
  lockCutoffUtc: string
  status: 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'CANCELLED'
}

type PickSlot = 'tenth' | 'winner' | 'dnf'

interface SelectedDrivers {
  tenth: string | null
  winner: string | null
  dnf: string | null
}

interface PickFormProps {
  race: SerializedRace
  entrants: DriverSummary[]
  existingPick: SerializedPickSetData | null
  isLocked: boolean
}

// ─────────────────────────────────────────────
// Group drivers by team
// ─────────────────────────────────────────────

interface TeamGroup {
  name: string
  color: string
  logoUrl: string | null
  slug: string | null
  drivers: DriverSummary[]
}

function groupByTeam(drivers: DriverSummary[]): TeamGroup[] {
  const map = new Map<string, TeamGroup>()

  for (const driver of drivers) {
    const key = driver.constructor.slug ?? driver.constructor.shortName
    if (!map.has(key)) {
      map.set(key, {
        name: driver.constructor.shortName,
        color: driver.constructor.color,
        logoUrl: driver.constructor.logoUrl,
        slug: driver.constructor.slug,
        drivers: [],
      })
    }
    map.get(key)!.drivers.push(driver)
  }

  // Sort teams alphabetically
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// ─────────────────────────────────────────────
// Driver bubble sub-component
// ─────────────────────────────────────────────

interface DriverBubbleProps {
  driver: DriverSummary
  isSelected: boolean
  isDisabled: boolean
  onClick: () => void
}

function DriverBubble({ driver, isSelected, isDisabled, onClick }: DriverBubbleProps) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all shrink-0 w-[72px]',
        'disabled:opacity-35 disabled:cursor-not-allowed',
        isSelected
          ? 'bg-surface-elevated'
          : 'hover:bg-surface-elevated/60',
      )}
    >
      {/* Headshot bubble */}
      <div
        className={cn(
          'relative w-14 h-14 rounded-full overflow-hidden shrink-0 transition-all',
          isSelected && 'ring-2 ring-offset-1 ring-offset-background',
        )}
        style={{
          boxShadow: isSelected ? `0 0 0 2px var(--background), 0 0 0 4px ${driver.constructor.color}` : undefined,
        }}
      >
        {driver.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.photoUrl}
            alt={`${driver.firstName} ${driver.lastName}`}
            className="w-full h-full object-cover"
            
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: driver.constructor.color }}
          >
            {driver.code.slice(0, 2)}
          </div>
        )}

        {/* Selected check overlay */}
        {isSelected && (
          <div className="absolute inset-0 flex items-end justify-end p-0.5">
            <div className="rounded-full bg-background p-0.5">
              <CheckCircle2
                className="h-3.5 w-3.5"
                style={{ color: driver.constructor.color }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Driver code */}
      <p
        className={cn(
          'text-[11px] font-bold leading-none',
          isSelected ? 'text-text-primary' : 'text-text-secondary',
        )}
      >
        {driver.code}
      </p>
      <p className="text-[9px] text-text-tertiary leading-none">#{driver.number}</p>
    </button>
  )
}

// ─────────────────────────────────────────────
// Team group header
// ─────────────────────────────────────────────

function TeamHeader({ group }: { group: TeamGroup }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      {group.logoUrl ? (
        <div
          className="w-8 h-5 flex items-center justify-center rounded overflow-hidden shrink-0"
          style={{ backgroundColor: group.color + '22' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={group.logoUrl}
            alt={group.name}
            className="h-3.5 w-auto object-contain"
          />
        </div>
      ) : (
        <div
          className="w-2 h-4 rounded-full shrink-0"
          style={{ backgroundColor: group.color }}
        />
      )}
      <span className="text-xs font-semibold text-text-secondary">{group.name}</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Pick section sub-component
// ─────────────────────────────────────────────

interface PickSectionProps {
  slot: PickSlot
  label: string
  subtitle: string
  groups: TeamGroup[]
  selected: string | null
  disabledIds: Set<string>
  onSelect: (driverId: string) => void
}

function PickSection({
  label,
  subtitle,
  groups,
  selected,
  disabledIds,
  onSelect,
}: PickSectionProps) {
  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <p className="text-xs text-text-secondary">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.slug ?? group.name}>
            <TeamHeader group={group} />
            <div className="flex flex-row gap-1 flex-wrap">
              {group.drivers.map((driver) => (
                <DriverBubble
                  key={driver.id}
                  driver={driver}
                  isSelected={selected === driver.id}
                  isDisabled={disabledIds.has(driver.id) && selected !== driver.id}
                  onClick={() => onSelect(driver.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function PickForm({
  race,
  entrants,
  existingPick,
  isLocked,
}: PickFormProps) {
  const [selected, setSelected] = React.useState<SelectedDrivers>({
    tenth: existingPick?.tenthPlaceDriverId ?? null,
    winner: existingPick?.winnerDriverId ?? null,
    dnf: existingPick?.dnfDriverId ?? null,
  })
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const groups = React.useMemo(() => groupByTeam(entrants), [entrants])

  const handleSelect = (slot: PickSlot, driverId: string) => {
    setSelected((prev) => ({
      ...prev,
      [slot]: prev[slot] === driverId ? null : driverId,
    }))
    if (status !== 'idle') setStatus('idle')
  }

  const disabledForSlot = (slot: PickSlot): Set<string> => {
    const others: (string | null)[] = Object.entries(selected)
      .filter(([k]) => k !== slot)
      .map(([, v]) => v)
    return new Set(others.filter(Boolean) as string[])
  }

  const allSelected =
    selected.tenth !== null &&
    selected.winner !== null &&
    selected.dnf !== null

  const allUnique =
    allSelected &&
    new Set([selected.tenth, selected.winner, selected.dnf]).size === 3

  const canSave = allUnique && !isLocked && status !== 'loading'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setStatus('loading')
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
        throw new Error(data?.error ?? 'Failed to save picks')
      }

      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  // ─── Locked / read-only view ───────────────────────────────────────────────

  if (isLocked) {
    const resolveDriver = (id: string | null | undefined) =>
      entrants.find((e) => e.id === id) ?? null

    const tenthDriver = resolveDriver(existingPick?.tenthPlaceDriverId)
    const winnerDriver = resolveDriver(existingPick?.winnerDriverId)
    const dnfDriver = resolveDriver(existingPick?.dnfDriverId)

    return (
      <div className="rounded-2xl bg-surface border border-[var(--border)] p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold text-accent">Picks locked</p>
        </div>

        {existingPick ? (
          <div className="flex flex-col gap-3">
            {(
              [
                { label: '10th Place', driver: tenthDriver },
                { label: 'Winner', driver: winnerDriver },
                { label: 'DNF', driver: dnfDriver },
              ] as const
            ).map(({ label, driver }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-text-tertiary w-20 shrink-0">{label}</span>
                {driver ? (
                  <div className="flex items-center gap-2">
                    {driver.photoUrl ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={driver.photoUrl}
                          alt={driver.code}
                          className="w-full h-full object-cover"
                          
                        />
                      </div>
                    ) : (
                      <div
                        className="h-4 w-1 rounded-full shrink-0"
                        style={{ backgroundColor: driver.constructor.color }}
                      />
                    )}
                    <span className="text-sm font-semibold text-text-primary">
                      {driver.code}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {driver.firstName} {driver.lastName}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-text-tertiary">—</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No picks submitted for this race.</p>
        )}
      </div>
    )
  }

  // ─── Editable form ────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <PickSection
        slot="tenth"
        label="10th Place"
        subtitle="Pick the driver who finishes P10"
        groups={groups}
        selected={selected.tenth}
        disabledIds={disabledForSlot('tenth')}
        onSelect={(id) => handleSelect('tenth', id)}
      />

      <PickSection
        slot="winner"
        label="Race Winner"
        subtitle="Pick the driver who wins the race"
        groups={groups}
        selected={selected.winner}
        disabledIds={disabledForSlot('winner')}
        onSelect={(id) => handleSelect('winner', id)}
      />

      <PickSection
        slot="dnf"
        label="DNF Pick"
        subtitle="Pick a driver who will not finish"
        groups={groups}
        selected={selected.dnf}
        disabledIds={disabledForSlot('dnf')}
        onSelect={(id) => handleSelect('dnf', id)}
      />

      {status === 'error' && errorMsg && (
        <p className="text-sm text-accent">{errorMsg}</p>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 text-[#30d158] text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          Picks saved!
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canSave}
        loading={status === 'loading'}
      >
        {existingPick ? 'Update Picks' : 'Save Picks'}
      </Button>
    </form>
  )
}
