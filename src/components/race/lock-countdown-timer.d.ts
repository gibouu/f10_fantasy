type LockCountdownTimerId = ReturnType<typeof setInterval>

type LockCountdownTimerOptions = {
  cutoff: number
  now?: () => number
  setIntervalFn?: (callback: () => void, delay: number) => LockCountdownTimerId
  clearIntervalFn?: (id: LockCountdownTimerId) => void
  onTick: (remainingMs: number) => void
  onLocked?: () => void
}

export function createLockCountdownTimer(
  options: LockCountdownTimerOptions,
): () => void
