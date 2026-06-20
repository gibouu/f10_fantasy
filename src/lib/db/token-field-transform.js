const TOKEN_FIELDS = new Set(["access_token", "refresh_token", "id_token"])
const TOKEN_STRING_OPERATORS = new Set(["equals", "not", "set"])
const TOKEN_STRING_ARRAY_OPERATORS = new Set(["in", "notIn"])

function transformTokenFieldValue(value, transform) {
  if (typeof value === "string") {
    return transform(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === "string" ? transform(entry) : entry,
    )
  }

  if (value instanceof Date || Buffer.isBuffer(value)) {
    return value
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const nextRecord = {}

  for (const [key, raw] of Object.entries(value)) {
    if (TOKEN_STRING_OPERATORS.has(key)) {
      nextRecord[key] = transformTokenFieldValue(raw, transform)
      continue
    }

    if (TOKEN_STRING_ARRAY_OPERATORS.has(key)) {
      nextRecord[key] = Array.isArray(raw)
        ? raw.map((entry) => (typeof entry === "string" ? transform(entry) : entry))
        : raw
      continue
    }

    nextRecord[key] = raw
  }

  return nextRecord
}

export function transformTokenFields(value, transform) {
  if (Array.isArray(value)) {
    return value.map((entry) => transformTokenFields(entry, transform))
  }

  if (value instanceof Date || Buffer.isBuffer(value)) {
    return value
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const nextRecord = {}

  for (const [key, raw] of Object.entries(value)) {
    if (TOKEN_FIELDS.has(key)) {
      nextRecord[key] = transformTokenFieldValue(raw, transform)
      continue
    }

    nextRecord[key] = transformTokenFields(raw, transform)
  }

  return nextRecord
}
