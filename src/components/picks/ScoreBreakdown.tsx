import * as React from 'react'

import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { ScoreBreakdownData } from '@/types/domain'
import {
  getScoreExplanation,
  MAX_MAIN_RACE_SCORE,
  MAX_SPRINT_SCORE,
} from '@/lib/scoring/formula'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ScoreBreakdownProps {
  scoreBreakdown: ScoreBreakdownData
  raceType: 'MAIN' | 'SPRINT'
}

// ─────────────────────────────────────────────
// Line item
// ─────────────────────────────────────────────

interface LineItemProps {
  label: string
  score: number
  maxScore: number
  explanation: string
}

function LineItem({ label, score, maxScore, explanation }: LineItemProps) {
  const scored = score > 0

  return (
    <div className="flex items-start gap-3 py-3 border-b border-[var(--border)]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{explanation}</p>
      </div>
      <div className="text-right shrink-0">
        <span
          className={cn(
            'text-sm font-bold',
            scored ? 'text-[#30d158]' : 'text-text-tertiary',
          )}
        >
          {score}
        </span>
        <span className="text-text-tertiary text-xs">/{maxScore}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function ScoreBreakdown({ scoreBreakdown, raceType }: ScoreBreakdownProps) {
  const maxTenth = raceType === 'MAIN' ? 25 : 10
  const maxWinner = raceType === 'MAIN' ? 5 : 2
  const maxDnf = raceType === 'MAIN' ? 3 : 1
  const maxTotal = raceType === 'MAIN' ? MAX_MAIN_RACE_SCORE : MAX_SPRINT_SCORE

  // Use the scoring formula's explanation helper
  const explanations = getScoreExplanation(
    {
      tenthPlaceScore: scoreBreakdown.tenthPlaceScore,
      winnerBonus: scoreBreakdown.winnerBonus,
      dnfBonus: scoreBreakdown.dnfBonus,
      totalScore: scoreBreakdown.totalScore,
    },
    raceType,
  )

  return (
    <Card variant="default">
      <CardHeader>
        <CardTitle>Score Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <LineItem
            label="10th Place Prediction"
            score={scoreBreakdown.tenthPlaceScore}
            maxScore={maxTenth}
            explanation={explanations[0]}
          />
          <LineItem
            label="Race Winner"
            score={scoreBreakdown.winnerBonus}
            maxScore={maxWinner}
            explanation={explanations[1]}
          />
          <LineItem
            label="DNF Pick"
            score={scoreBreakdown.dnfBonus}
            maxScore={maxDnf}
            explanation={explanations[2]}
          />

          {/* Divider + total */}
          <div className="flex items-center justify-between pt-3">
            <span className="text-sm font-semibold text-text-primary">Total</span>
            <div>
              <span
                className={cn(
                  'text-base font-bold',
                  scoreBreakdown.totalScore > 0 ? 'text-[#30d158]' : 'text-text-tertiary',
                )}
              >
                {scoreBreakdown.totalScore}
              </span>
              <span className="text-text-tertiary text-sm">/{maxTotal}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
