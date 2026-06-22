import type { LeaderboardRow } from '@/types/domain'

export function rankRows(rows: Array<Omit<LeaderboardRow, 'rank'>>): LeaderboardRow[]
