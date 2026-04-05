'use client'

import * as React from 'react'
import { Lock } from 'lucide-react'

import { cn, msToCountdown } from '@/lib/utils'

export interface LockCountdownProps {
  /** ISO 8601 timestamp string — must be parseable by `new Date()` */
  lockCutoffUtc: string
  onLocked?: () => void
  className?: string
}

export function LockCountdown({
  lockCutoffUtc,
  onLocked,
  className,
}: LockCountdownProps) {
  const cutoff = React.useMemo(
    () => new Date(lockCutoffUtc).getTime(),
    [lockCutoffUtc],
  )

  const [msLeft, setMsLeft] = React.useState<number>(() => cutoff - Date.now())
  const onLockedRef = React.useRef(onLocked)
  onLockedRef.current = onLocked

  React.useEffect(() => {
    const tick = () => {
      const remaining = cutoff - Date.now()
      setMsLeft(remaining)

      // Fire callback once when we cross the threshold
      if (remaining <= 0) {
        clearInterval(id)
        onLockedRef.current?.()
      }
    }

    const id = setInterval(tick, 1_000)
    tick() // run immediately to avoid 1-second blank
    return () => clearInterval(id)
  }, [cutoff])

  // Locked state
  if (msLeft <= 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium text-accent',
          className,
        )}
      >
        <Lock className="h-3.5 w-3.5" />
        Picks locked
      </span>
    )
  }

  const isUnderFiveMin = msLeft < 5 * 60 * 1_000
  const isUnderOneHour = msLeft < 60 * 60 * 1_000
  const label = `Locks in ${msToCountdown(msLeft)}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium',
        isUnderFiveMin
          ? 'text-accent animate-pulse'
          : isUnderOneHour
            ? 'text-warning'
            : 'text-text-secondary',
        className,
      )}
    >
      <Lock className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  )
}
