import type { TeamSlug } from './teams'

export type TeamSeatKey = `${string}:${number}`

type SeatAssignableDriver = {
  id: string
  code: string
  number: number
  teamId: string
  teamSlug: string | null
}

const OFFICIAL_TEAM_SEATS: Partial<Record<TeamSlug, readonly [string, string]>> = {
  alpine: ['GAS', 'COL'],
  'aston-martin': ['ALO', 'STR'],
  audi: ['HUL', 'BOR'],
  cadillac: ['PER', 'BOT'],
  ferrari: ['LEC', 'HAM'],
  haas: ['OCO', 'BEA'],
  mclaren: ['NOR', 'PIA'],
  mercedes: ['RUS', 'ANT'],
  'racing-bulls': ['LAW', 'LIN'],
  'red-bull': ['VER', 'HAD'],
  williams: ['ALB', 'SAI'],
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function getSeatBaseKey(driver: Pick<SeatAssignableDriver, 'teamId' | 'teamSlug'>): string {
  return driver.teamSlug ?? `constructor:${driver.teamId}`
}

function toSeatKey(baseKey: string, seatNumber: number): TeamSeatKey {
  return `${baseKey}:${seatNumber}`
}

function sortDrivers<T extends SeatAssignableDriver>(drivers: T[]): T[] {
  return [...drivers].sort(
    (a, b) => a.number - b.number || a.code.localeCompare(b.code),
  )
}

export function inferSeatKeyFromDriver(
  driver: SeatAssignableDriver,
): TeamSeatKey | null {
  const slug = driver.teamSlug as TeamSlug | null
  if (!slug) return null

  const seats = OFFICIAL_TEAM_SEATS[slug]
  if (!seats) return null

  const seatIndex = seats.findIndex((code) => code === normalizeCode(driver.code))
  if (seatIndex === -1) return null

  return toSeatKey(getSeatBaseKey(driver), seatIndex + 1)
}

export function buildSeatLookup<T extends SeatAssignableDriver>(drivers: T[]) {
  const driverIdToSeatKey = new Map<string, TeamSeatKey>()
  const seatKeyToDriverId = new Map<TeamSeatKey, string>()
  const grouped = new Map<string, T[]>()

  for (const driver of drivers) {
    const baseKey = getSeatBaseKey(driver)
    if (!grouped.has(baseKey)) {
      grouped.set(baseKey, [])
    }
    grouped.get(baseKey)!.push(driver)
  }

  for (const [baseKey, teamDrivers] of Array.from(grouped.entries())) {
    const sortedDrivers = sortDrivers(teamDrivers)
    const slug = sortedDrivers[0]?.teamSlug as TeamSlug | null
    const seats = slug ? OFFICIAL_TEAM_SEATS[slug] : undefined
    const assignedIds = new Set<string>()
    const remainingSeatNumbers: number[] = []

    if (seats) {
      seats.forEach((incumbentCode, index) => {
        const incumbent = sortedDrivers.find(
          (driver) => normalizeCode(driver.code) === incumbentCode,
        )
        const seatKey = toSeatKey(baseKey, index + 1)

        if (incumbent) {
          driverIdToSeatKey.set(incumbent.id, seatKey)
          seatKeyToDriverId.set(seatKey, incumbent.id)
          assignedIds.add(incumbent.id)
        } else {
          remainingSeatNumbers.push(index + 1)
        }
      })
    }

    const unassignedDrivers = sortedDrivers.filter(
      (driver) => !assignedIds.has(driver.id),
    )

    if (!seats) {
      unassignedDrivers.forEach((driver, index) => {
        const seatKey = toSeatKey(baseKey, index + 1)
        driverIdToSeatKey.set(driver.id, seatKey)
        seatKeyToDriverId.set(seatKey, driver.id)
      })
      continue
    }

    unassignedDrivers.forEach((driver, index) => {
      const seatNumber =
        remainingSeatNumbers[index] ?? seats.length + index + 1
      const seatKey = toSeatKey(baseKey, seatNumber)
      driverIdToSeatKey.set(driver.id, seatKey)
      seatKeyToDriverId.set(seatKey, driver.id)
    })
  }

  return {
    driverIdToSeatKey,
    seatKeyToDriverId,
  }
}
