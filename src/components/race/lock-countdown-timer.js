export function createLockCountdownTimer({
  cutoff,
  now = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  onTick,
  onLocked,
}) {
  let intervalId
  let locked = false

  const tick = () => {
    const remaining = cutoff - now()
    onTick(remaining)

    if (remaining <= 0 && !locked) {
      locked = true
      if (intervalId !== undefined) {
        clearIntervalFn(intervalId)
      }
      onLocked?.()
    }
  }

  intervalId = setIntervalFn(tick, 1_000)
  tick()

  return () => {
    if (intervalId !== undefined) {
      clearIntervalFn(intervalId)
    }
  }
}
