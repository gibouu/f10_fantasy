"use client"

import { signOut } from "next-auth/react"

export function SignOutButton() {
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/revoke-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }).catch(() => null)

        await signOut({ callbackUrl: "/signin" })
      }}
      className="w-full py-3 text-sm font-medium text-red-500 rounded-2xl
                 border border-red-500/20 bg-red-500/5
                 hover:bg-red-500/10 transition-colors"
    >
      Sign out
    </button>
  )
}
