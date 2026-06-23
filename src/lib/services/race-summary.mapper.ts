import type { RaceSummary } from '@/types/domain'
import { RaceStatus, RaceType } from '@/types/domain'

export type RaceSummaryInput = {
  id: string
  seasonId: string
  round: number
  name: string
  circuitName: string
  country: string
  type: string
  scheduledStartUtc: Date
  lockCutoffUtc: Date
  status: string
  qualifyingStartUtc?: Date | null
}

export function mapRaceToSummary(race: RaceSummaryInput): RaceSummary {
  return {
    id: race.id,
    seasonId: race.seasonId,
    round: race.round,
    name: race.name,
    circuitName: race.circuitName,
    country: race.country,
    type: race.type as RaceType,
    scheduledStartUtc: race.scheduledStartUtc,
    lockCutoffUtc: race.lockCutoffUtc,
    status: race.status as RaceStatus,
    qualifyingStartUtc: race.qualifyingStartUtc ?? null,
  }
}
