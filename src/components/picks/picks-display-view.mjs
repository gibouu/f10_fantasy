export function scoreTone(score) {
  return score > 0 ? "positive" : "neutral"
}

export function formatScoreChip(score) {
  return `+${score}`
}

export function actualResultLabel(actualResult) {
  if (!actualResult) return "—"
  return actualResult.position !== null ? `P${actualResult.position}` : actualResult.status
}

export function totalScoreFromBreakdown(scoreBreakdown) {
  return scoreBreakdown?.totalScore ?? 0
}
