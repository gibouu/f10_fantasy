"use client"

import { useEffect } from "react"
import {
  messageFromUnknown,
  reportClientError,
} from "@/lib/observability/report-client-error"

export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError({
        kind: "error",
        message: event.error
          ? messageFromUnknown(event.error)
          : event.message || "Unhandled client error",
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError({
        kind: "unhandledrejection",
        message: messageFromUnknown(event.reason),
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}
