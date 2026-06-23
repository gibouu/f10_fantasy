export function isMissingCompletedResult(raceStatus, resultDriver) {
  return raceStatus === "COMPLETED" && !resultDriver
}

export function isActualResultPending(raceStatus, resultDriver) {
  return (
    raceStatus !== "LIVE" &&
    raceStatus !== "COMPLETED" &&
    !isMissingCompletedResult(raceStatus, resultDriver)
  )
}

export function isPickResultMatched(raceStatus, pickDriverId, resultDriverId) {
  return Boolean(
    raceStatus === "COMPLETED" &&
      pickDriverId &&
      resultDriverId &&
      pickDriverId === resultDriverId,
  )
}
