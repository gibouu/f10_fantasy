export function shouldIngestRaceResults({
  mode,
  raceId,
  openf1SessionKey,
  resultRaceIds,
}) {
  return (
    openf1SessionKey !== null &&
    (mode === "force" ||
      mode === "targeted" ||
      resultRaceIds.has(raceId))
  )
}
