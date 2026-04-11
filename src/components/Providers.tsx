"use client"

import { SessionProvider, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * Calls router.refresh() whenever the session transitions to authenticated.
 * This fixes OAuth providers (especially Apple's form_post flow) where the
 * Next.js App Router client-side cache still shows the pre-auth state after
 * the callback redirect, requiring a manual browser refresh.
 */
function SessionSync() {
  const { status } = useSession()
  const router = useRouter()
  const prevStatus = useRef(status)

  useEffect(() => {
    if (prevStatus.current !== "authenticated" && status === "authenticated") {
      router.refresh()
    }
    prevStatus.current = status
  }, [status, router])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionSync />
      {children}
    </SessionProvider>
  )
}
