import type { DriverSummary, PickSetData } from '@/types/domain'

type SeatAwarePick = PickSetData

function buildEntrantIndexes(entrants: DriverSummary[]) {
  const seatKeyToDriverId = new Map<string, string>()

  for (const entrant of entrants) {
    if (!entrant.seatKey) continue
    seatKeyToDriverId.set(entrant.seatKey, entrant.id)
  }

  return {
    seatKeyToDriverId,
  }
}

function resolveSlotDriverId(
  seatKeyToDriverId: Map<string, string>,
  seatKey: string | null,
  fallbackDriverId: string,
): string {
  if (seatKey) {
    const activeDriverId = seatKeyToDriverId.get(seatKey)
    if (activeDriverId) return activeDriverId
  }

  return fallbackDriverId
}

export function resolvePickAgainstEntrants<T extends SeatAwarePick>(
  pick: T,
  entrants: DriverSummary[],
): T {
  const { seatKeyToDriverId } = buildEntrantIndexes(entrants)

  return {
    ...pick,
    tenthPlaceDriverId: resolveSlotDriverId(
      seatKeyToDriverId,
      pick.tenthPlaceSeatKey,
      pick.tenthPlaceDriverId,
    ),
    winnerDriverId: resolveSlotDriverId(
      seatKeyToDriverId,
      pick.winnerSeatKey,
      pick.winnerDriverId,
    ),
    dnfDriverId: resolveSlotDriverId(
      seatKeyToDriverId,
      pick.dnfSeatKey,
      pick.dnfDriverId,
    ),
  }
}
