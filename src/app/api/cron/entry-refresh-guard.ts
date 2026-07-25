export const MIN_VALID_ENTRY_COUNT = 10

export function getRaceEntryRefreshSkipReason({
  existingCount,
  nextCount,
}: {
  existingCount: number
  nextCount: number
}): string | null {
  if (nextCount < MIN_VALID_ENTRY_COUNT) {
    return `too-few-entries:${nextCount}`
  }

  if (existingCount > 0 && nextCount < existingCount) {
    return `entry-count-regression:${existingCount}->${nextCount}`
  }

  return null
}
