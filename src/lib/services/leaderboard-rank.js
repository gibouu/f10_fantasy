function compareLeaderboardRows(a, b) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
  if (b.exactTenthHits !== a.exactTenthHits) return b.exactTenthHits - a.exactTenthHits
  if (b.winnerHits !== a.winnerHits) return b.winnerHits - a.winnerHits
  if (b.dnfHits !== a.dnfHits) return b.dnfHits - a.dnfHits
  return a.userId.localeCompare(b.userId)
}

function hasSameRankScore(a, b) {
  return (
    a.totalScore === b.totalScore &&
    a.exactTenthHits === b.exactTenthHits &&
    a.winnerHits === b.winnerHits &&
    a.dnfHits === b.dnfHits
  )
}

export function rankRows(rows) {
  const sorted = [...rows].sort(compareLeaderboardRows)
  let previous = null
  let rank = 0

  return sorted.map((row, index) => {
    if (!previous || !hasSameRankScore(row, previous)) {
      rank = index + 1
    }
    previous = row

    return {
      rank,
      ...row,
    }
  })
}
