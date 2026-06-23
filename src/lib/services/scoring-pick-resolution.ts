export function resolveSeatKeyForScoring({
  storedSeatKey,
  lockedDriverId,
  inferSeatKeyFromLiveDriver,
}: {
  storedSeatKey: string | null
  lockedDriverId: string | null
  inferSeatKeyFromLiveDriver: () => string | null
}): string | null {
  if (storedSeatKey) return storedSeatKey
  if (lockedDriverId !== null) return null
  return inferSeatKeyFromLiveDriver()
}
