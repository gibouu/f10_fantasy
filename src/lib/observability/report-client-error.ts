"use client"

type ClientErrorKind = "boundary" | "error" | "unhandledrejection"

type ClientErrorReport = {
  kind: ClientErrorKind
  message: string
  digest?: string
}

function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message || value.name
  }

  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value) ?? "Client error"
  } catch {
    return "Client error"
  }
}

export function messageFromUnknown(value: unknown): string {
  return stringifyUnknown(value).trim() || "Client error"
}

export function reportClientError(report: ClientErrorReport) {
  if (typeof window === "undefined") {
    return
  }

  const body = JSON.stringify({
    kind: report.kind,
    message: report.message.trim() || "Client error",
    digest: report.digest,
    path: window.location.pathname,
  })

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        "/api/client-errors",
        new Blob([body], { type: "application/json" }),
      )
      if (sent) {
        return
      }
    }

    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Reporting must never create another visible client error.
  }
}
