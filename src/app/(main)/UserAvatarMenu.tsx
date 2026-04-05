"use client"

import { useState, useRef, useEffect } from "react"
import { signOut } from "next-auth/react"
import Link from "next/link"
import type { Session } from "next-auth"

type User = Session["user"] | null

/** Derive 1–2 initials from a display name or email. */
function getInitials(user: NonNullable<User>): string {
  const name = user.name ?? user.email ?? user.publicUsername ?? "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

interface UserAvatarMenuProps {
  user: User
  teamLogoUrl?: string | null
  teamColor?: string | null
}

export function UserAvatarMenu({ user, teamLogoUrl, teamColor }: UserAvatarMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  if (!user) return null

  const initials = getInitials(user)
  const teamBg = teamColor ? `${teamColor}40` : "#1c1c1e"

  return (
    <div className="relative" ref={ref}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-surface-elevated border border-[var(--border)]
                   flex items-center justify-center overflow-hidden
                   transition-opacity active:opacity-70 focus-visible:ring-2
                   focus-visible:ring-accent focus-visible:ring-offset-2
                   focus-visible:ring-offset-background"
        aria-label="Open user menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {teamLogoUrl ? (
          <div
            className="w-full h-full flex items-center justify-center p-1"
            style={{ backgroundColor: teamBg }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={teamLogoUrl}
              alt="Team logo"
              className="w-full h-full object-contain"
            />
          </div>
        ) : user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? "Avatar"}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs font-semibold text-text-secondary">
            {initials}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 rounded-2xl glass shadow-xl
                     border border-black/[0.07] overflow-hidden z-50
                     animate-slide-up origin-top-right"
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-black/[0.06]">
            {user.publicUsername && (
              <p className="text-text-primary text-sm font-semibold truncate">
                @{user.publicUsername}
              </p>
            )}
            {user.email && (
              <p className="text-text-tertiary text-xs truncate mt-0.5">
                {user.email}
              </p>
            )}
          </div>

          {/* Actions */}
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block w-full px-4 py-3 text-left text-sm text-text-secondary
                       hover:text-text-primary hover:bg-black/[0.04]
                       transition-colors"
          >
            Pick your team
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              signOut({ callbackUrl: "/signin" })
            }}
            className="w-full px-4 py-3 text-left text-sm text-text-secondary
                       hover:text-text-primary hover:bg-black/[0.04]
                       transition-colors border-t border-black/[0.06]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
