/**
 * Core domain types used throughout the application.
 * These mirror the Prisma models but are decoupled from the ORM layer,
 * making them safe to import in client components and server logic alike.
 */

// ─────────────────────────────────────────────
// Enums (mirrored from Prisma schema)
// ─────────────────────────────────────────────

export enum RaceType {
  MAIN = 'MAIN',
  SPRINT = 'SPRINT',
}

export enum RaceStatus {
  UPCOMING = 'UPCOMING',
  LIVE = 'LIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ResultStatus {
  CLASSIFIED = 'CLASSIFIED',
  DNF = 'DNF',
  DNS = 'DNS',
  DSQ = 'DSQ',
}

export enum FriendRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

// ─────────────────────────────────────────────
// Driver & Constructor
// ─────────────────────────────────────────────

export type DriverSummary = {
  id: string
  code: string
  firstName: string
  lastName: string
  number: number
  photoUrl: string | null
  constructor: {
    id: string
    name: string
    shortName: string
    /** Hex color string, e.g. "#E8002D" */
    color: string
    /** Team slug used for logo lookup, e.g. "mercedes" */
    slug: string | null
    /** Path to white team logo, e.g. "/teamlogos/mercedes.webp" */
    logoUrl: string | null
  }
}

// ─────────────────────────────────────────────
// Race
// ─────────────────────────────────────────────

export type RaceSummary = {
  id: string
  seasonId: string
  round: number
  name: string
  circuitName: string
  country: string
  type: RaceType
  scheduledStartUtc: Date
  /** Picks are locked at or after this time */
  lockCutoffUtc: Date
  status: RaceStatus
}

export type RaceResultRecord = {
  driverId: string
  /** null for DNS / DSQ before race start */
  position: number | null
  status: ResultStatus
  fastestLap: boolean
}

// ─────────────────────────────────────────────
// Picks
// ─────────────────────────────────────────────

export type PickSetData = {
  id: string
  userId: string
  raceId: string
  tenthPlaceDriverId: string
  winnerDriverId: string
  dnfDriverId: string
  createdAt: Date
  updatedAt: Date
  /** Set when the pick set is locked; null means still editable */
  lockedAt: Date | null
}

// ─────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────

export type ScoreBreakdownData = {
  tenthPlaceScore: number
  winnerBonus: number
  dnfBonus: number
  totalScore: number
  computedAt: Date
}

export type PickSetWithScore = PickSetData & {
  /** null if the race has not been scored yet */
  scoreBreakdown: ScoreBreakdownData | null
  race: RaceSummary
}

// ─────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────

export type LeaderboardRow = {
  rank: number
  userId: string
  publicUsername: string | null
  avatarUrl: string | null
  /** Team logo path if the user has chosen a favourite team, e.g. "/teamlogos/mercedes.webp" */
  teamLogoUrl: string | null
  /** Team color for the logo background if teamLogoUrl is set */
  teamColor: string | null
  totalScore: number
  /** Count of races where tenthPlaceScore was at the maximum value for the race type */
  exactTenthHits: number
  winnerHits: number
  dnfHits: number
}

// ─────────────────────────────────────────────
// Social
// ─────────────────────────────────────────────

export type FriendRequestData = {
  id: string
  requesterId: string
  requesterUsername: string | null
  requesterAvatar: string | null
  addresseeId: string
  status: FriendRequestStatus
  createdAt: Date
}

// ─────────────────────────────────────────────
// Serialized variants (dates as ISO strings)
// Used when passing server-loaded data to client components via props.
// Next.js cannot serialize Date instances across the RSC/client boundary.
// ─────────────────────────────────────────────

export type SerializedRaceSummary = Omit<RaceSummary, 'scheduledStartUtc' | 'lockCutoffUtc'> & {
  scheduledStartUtc: string
  lockCutoffUtc: string
}

export type SerializedScoreBreakdownData = Omit<ScoreBreakdownData, 'computedAt'> & {
  computedAt: string
}

export type SerializedPickSetData = Omit<PickSetData, 'createdAt' | 'updatedAt' | 'lockedAt'> & {
  createdAt: string
  updatedAt: string
  lockedAt: string | null
}

export type SerializedPickSetWithScore = SerializedPickSetData & {
  scoreBreakdown: SerializedScoreBreakdownData | null
  race: SerializedRaceSummary
}
