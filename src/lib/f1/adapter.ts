/**
 * F1 provider abstraction layer.
 *
 * All application code that needs F1 data should import from here, never
 * directly from a concrete provider. This makes it trivial to swap providers
 * or add caching/mock layers without touching call sites.
 */

import type {
  NormalizedMeeting,
  NormalizedSession,
  NormalizedDriver,
  NormalizedLiveClassification,
  NormalizedFinalResult,
} from './types'

// ─────────────────────────────────────────────
// Provider interface
// ─────────────────────────────────────────────

export interface F1ProviderAdapter {
  /**
   * Return all meetings (Grand Prix weekends) for a given calendar year.
   */
  getMeetings(year: number): Promise<NormalizedMeeting[]>

  /**
   * Return all sessions for a given calendar year.
   * Implementations should map provider-specific session names to the
   * canonical NormalizedSession.type values.
   */
  getSessions(year: number): Promise<NormalizedSession[]>

  /**
   * Return the list of drivers who participated in a specific session.
   */
  getDriversForSession(sessionKey: number): Promise<NormalizedDriver[]>

  /**
   * Return a snapshot of the current live race order.
   * Returns null when the session hasn't started or no position data exists.
   */
  getLiveClassification(
    sessionKey: number,
  ): Promise<NormalizedLiveClassification | null>

  /**
   * Return the definitive final results for a completed session.
   * Each driver entry includes a classified position or a non-classified status.
   */
  getFinalResults(sessionKey: number): Promise<NormalizedFinalResult[]>

  /**
   * Return the qualifying classification grid for a qualifying session.
   * Unlike `getFinalResults`, this does NOT use stint heuristics for DNF
   * detection — qualifying eliminations leave drivers with sparse stint data.
   * Drivers eliminated in Q1/Q2 are returned with their final qualifying
   * position. DNS / DSQ drivers are omitted (position would be misleading).
   */
  getQualifyingClassification(
    sessionKey: number,
  ): Promise<Array<{ driverNumber: number; position: number }>>
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/**
 * Returns the active F1 data provider.
 *
 * Currently wired to the OpenF1 implementation. To swap providers (e.g. for
 * testing or a paid data source), replace the import below without changing
 * any call sites.
 */
export function createF1Provider(): F1ProviderAdapter {
  // Lazy import to avoid bundling the provider in client-side code
  const { OpenF1Provider } = require('./providers/openf1') as typeof import('./providers/openf1') // eslint-disable-line
  return new OpenF1Provider()
}
