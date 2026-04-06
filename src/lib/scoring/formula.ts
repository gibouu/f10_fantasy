/**
 * Pure scoring functions — no database, no side effects, fully deterministic.
 *
 * Scoring rules:
 *   Main race:
 *     - 10th place pick: max(0, 25 - |position - 10| * 3) for CLASSIFIED drivers
 *     - Winner bonus:    +5 if picked driver finishes P1
 *     - DNF bonus:       +3 if picked driver is DNF
 *   Sprint:
 *     - 10th place pick: max(0, 10 - |position - 10|) for CLASSIFIED drivers
 *     - Winner bonus:    +2 if picked driver finishes P1
 *     - DNF bonus:       +1 if picked driver is DNF
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

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Maximum achievable score in a main race (25 + 5 + 3) */
export const MAX_MAIN_RACE_SCORE = 33

/** Maximum achievable score in a sprint (10 + 2 + 1) */
export const MAX_SPRINT_SCORE = 13

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

function findResult(
  driverNumber: number,
  results: NormalizedFinalResult[],
): NormalizedFinalResult | undefined {
  return results.find((r) => r.driverNumber === driverNumber)
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
 * Main:   max(0, 25 - |position - 10| * 3)
 * Sprint: max(0, 10 - |position - 10|)
 */
export function computeTenthPlaceScore(
  driverNumber: number,
  ctx: ScoringContext,
): number {
  const result = findResult(driverNumber, ctx.results)
  if (!result || result.status !== 'CLASSIFIED' || result.position === null) {
    return 0
  }

  const delta = Math.abs(result.position - 10)

  if (ctx.raceType === 'MAIN') {
    return Math.max(0, 25 - delta * 3)
  } else {
    return Math.max(0, 10 - delta)
  }
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
  if (!result || result.position !== 1) return 0

  return ctx.raceType === 'MAIN' ? 5 : 2
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
  if (!result || result.status === 'CLASSIFIED') return 0

  return ctx.raceType === 'MAIN' ? 3 : 1
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
  const maxTenth = raceType === 'MAIN' ? 25 : 10
  const maxWinner = raceType === 'MAIN' ? 5 : 2
  const maxDnf = raceType === 'MAIN' ? 3 : 1

  // 10th place explanation
  if (score.tenthPlaceScore === maxTenth) {
    lines.push(`Perfect 10th place pick! +${score.tenthPlaceScore} pts`)
  } else if (score.tenthPlaceScore > 0) {
    lines.push(`10th place pick scored +${score.tenthPlaceScore} pts (off by ${
      raceType === 'MAIN'
        ? Math.round((maxTenth - score.tenthPlaceScore) / 3)
        : maxTenth - score.tenthPlaceScore
    } position${score.tenthPlaceScore < maxTenth - 3 ? 's' : ''})`)
  } else {
    lines.push('10th place pick scored 0 pts (too far off or driver did not finish)')
  }

  // Winner bonus explanation
  if (score.winnerBonus === maxWinner) {
    lines.push(`Correct winner pick! +${score.winnerBonus} pts`)
  } else {
    lines.push('Winner pick incorrect — +0 pts')
  }

  // DNF bonus explanation
  if (score.dnfBonus === maxDnf) {
    lines.push(`Correct DNF pick! +${score.dnfBonus} pts`)
  } else {
    lines.push('DNF pick incorrect — +0 pts')
  }

  lines.push(`Total: ${score.totalScore} / ${maxTenth + maxWinner + maxDnf} pts`)

  return lines
}
