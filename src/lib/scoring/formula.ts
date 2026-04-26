/**
 * Pure scoring functions — no database, no side effects, fully deterministic.
 *
 * Scoring rules:
 *   Main race:
 *     - 10th place pick: MAIN_P10_POINTS_BY_DELTA[|position - 10|]
 *       for CLASSIFIED drivers (25 exact, 18 one off, ... 2 eight off)
 *     - Winner bonus:    +5 if picked driver finishes P1
 *     - DNF bonus:       +3 if picked driver is not classified
 *   Sprint:
 *     - 10th place pick: max(0, 8 - |position - 10|) for CLASSIFIED drivers
 *     - Winner bonus:    +2 if picked driver finishes P1
 *     - DNF bonus:       +1 if picked driver is not classified
 */

import type { NormalizedFinalResult } from '../f1/types'

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

export type ScoringContext = {
  raceType: 'MAIN' | 'SPRINT'
  results: NormalizedFinalResult[]
}

export type PickInput = {
  /** Internal DB driver id */
  tenthPlaceDriverId: string
  winnerDriverId: string
  dnfDriverId: string
}

/** Map from internal DB driver id → OpenF1 driverNumber for result lookup */
export type DriverIdToNumber = Map<string, number>

export type ScoreOutput = {
  tenthPlaceScore: number
  winnerBonus: number
  dnfBonus: number
  totalScore: number
}

export type RaceScoringCaps = {
  p10: number
  winner: number
  dnf: number
  total: number
}

export type ResultScoreGuide = {
  p10: number
  winner: number
  dnf: number
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

export const MAIN_P10_POINTS_BY_DELTA = [25, 18, 15, 12, 10, 8, 6, 4, 2] as const

export const MAIN_WINNER_BONUS = 5
export const SPRINT_WINNER_BONUS = 2
export const MAIN_DNF_BONUS = 3
export const SPRINT_DNF_BONUS = 1
export const MAX_MAIN_TENTH_SCORE = MAIN_P10_POINTS_BY_DELTA[0]
export const MAX_SPRINT_TENTH_SCORE = 8

/** Maximum achievable score in a main race (25 + 5 + 3) */
export const MAX_MAIN_RACE_SCORE = 33

/** Maximum achievable score in a sprint (8 + 2 + 1) */
export const MAX_SPRINT_SCORE = 11

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

function findResult(
  driverNumber: number,
  results: NormalizedFinalResult[],
): NormalizedFinalResult | undefined {
  return results.find((r) => r.driverNumber === driverNumber)
}

function isClassified(status: NormalizedFinalResult['status'] | string): boolean {
  return status === 'CLASSIFIED'
}

// ─────────────────────────────────────────────
// Scoring functions
// ─────────────────────────────────────────────

/**
 * Score for the 10th-place pick.
 *
 * Only CLASSIFIED drivers earn points here. Non-classified drivers
 * (DNF / DNS / DSQ) score 0 regardless of position.
 *
 * Main:   MAIN_P10_POINTS_BY_DELTA[|position - 10|]
 * Sprint: max(0, 8 - |position - 10|)
 */
export function computeTenthPlaceScore(
  driverNumber: number,
  ctx: ScoringContext,
): number {
  const result = findResult(driverNumber, ctx.results)
  if (!result) return 0
  return computeTenthPlaceScoreForResult(result, ctx.raceType)
}

export function computeTenthPlaceScoreForResult(
  result: Pick<NormalizedFinalResult, 'position' | 'status'>,
  raceType: 'MAIN' | 'SPRINT',
): number {
  if (!isClassified(result.status) || result.position === null) {
    return 0
  }

  const delta = Math.abs(result.position - 10)

  return raceType === 'MAIN'
    ? (MAIN_P10_POINTS_BY_DELTA[delta] ?? 0)
    : Math.max(0, MAX_SPRINT_TENTH_SCORE - delta)
}

/**
 * Bonus for correctly picking the race winner (P1 finisher).
 *
 * Main:   +5
 * Sprint: +2
 */
export function computeWinnerBonus(
  driverNumber: number,
  ctx: ScoringContext,
): number {
  const result = findResult(driverNumber, ctx.results)
  if (!result || !isClassified(result.status) || result.position !== 1) return 0

  return getScoringCaps(ctx.raceType).winner
}

/**
 * Bonus for correctly picking a driver who did not finish.
 *
 * Awards points for any non-classified outcome: DNF, DNS, DSQ.
 *
 * Main:   +3
 * Sprint: +1
 */
export function computeDnfBonus(
  driverNumber: number,
  ctx: ScoringContext,
): number {
  const result = findResult(driverNumber, ctx.results)
  if (!result || isClassified(result.status)) return 0

  return getScoringCaps(ctx.raceType).dnf
}

/**
 * Compute the full score breakdown for a single pick set.
 *
 * If a driver ID is not present in the driverMap (e.g., they withdrew after
 * picks were locked), that category scores 0 rather than throwing.
 */
export function computeRaceScore(
  picks: PickInput,
  driverMap: DriverIdToNumber,
  ctx: ScoringContext,
): ScoreOutput {
  const tenthNum = driverMap.get(picks.tenthPlaceDriverId)
  const winnerNum = driverMap.get(picks.winnerDriverId)
  const dnfNum = driverMap.get(picks.dnfDriverId)

  const tenthPlaceScore =
    tenthNum !== undefined ? computeTenthPlaceScore(tenthNum, ctx) : 0
  const winnerBonus =
    winnerNum !== undefined ? computeWinnerBonus(winnerNum, ctx) : 0
  const dnfBonus =
    dnfNum !== undefined ? computeDnfBonus(dnfNum, ctx) : 0

  return {
    tenthPlaceScore,
    winnerBonus,
    dnfBonus,
    totalScore: tenthPlaceScore + winnerBonus + dnfBonus,
  }
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────

/**
 * Returns an array of human-readable explanation strings describing how
 * each component of the score was earned. Suitable for tooltip / detail views.
 */
export function getScoreExplanation(
  score: ScoreOutput,
  raceType: 'MAIN' | 'SPRINT',
): string[] {
  const lines: string[] = []
  const caps = getScoringCaps(raceType)

  // 10th place explanation
  if (score.tenthPlaceScore === caps.p10) {
    lines.push(`Perfect 10th place pick! +${score.tenthPlaceScore} pts`)
  } else if (score.tenthPlaceScore > 0) {
    lines.push(`10th place pick scored +${score.tenthPlaceScore} pts`)
  } else {
    lines.push('10th place pick scored 0 pts (too far off or driver did not finish)')
  }

  // Winner bonus explanation
  if (score.winnerBonus === caps.winner) {
    lines.push(`Correct winner pick! +${score.winnerBonus} pts`)
  } else {
    lines.push('Winner pick incorrect — +0 pts')
  }

  // DNF bonus explanation
  if (score.dnfBonus === caps.dnf) {
    lines.push(`Correct DNF pick! +${score.dnfBonus} pts`)
  } else {
    lines.push('DNF pick incorrect — +0 pts')
  }

  lines.push(`Total: ${score.totalScore} / ${caps.total} pts`)

  return lines
}

export function getScoringCaps(raceType: 'MAIN' | 'SPRINT'): RaceScoringCaps {
  return raceType === 'MAIN'
    ? {
        p10: MAX_MAIN_TENTH_SCORE,
        winner: MAIN_WINNER_BONUS,
        dnf: MAIN_DNF_BONUS,
        total: MAX_MAIN_RACE_SCORE,
      }
    : {
        p10: MAX_SPRINT_TENTH_SCORE,
        winner: SPRINT_WINNER_BONUS,
        dnf: SPRINT_DNF_BONUS,
        total: MAX_SPRINT_SCORE,
      }
}

export function getResultScoreGuide(
  result: Pick<NormalizedFinalResult, 'position' | 'status'>,
  raceType: 'MAIN' | 'SPRINT',
): ResultScoreGuide {
  const caps = getScoringCaps(raceType)

  return {
    p10: computeTenthPlaceScoreForResult(result, raceType),
    winner: isClassified(result.status) && result.position === 1 ? caps.winner : 0,
    dnf: isClassified(result.status) ? 0 : caps.dnf,
  }
}
