"use client"

import Link from "next/link"
import type { Session } from "next-auth"

type User = Session["user"] | null

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
  if (!user) return null

  const initials = getInitials(user)
  const teamBg = teamColor ? `${teamColor}40` : "#1c1c1e"

  return (
    <Link
      href="/profile"
      className="w-8 h-8 rounded-full bg-surface-elevated border border-[var(--border)]
                 flex items-center justify-center overflow-hidden
                 transition-opacity active:opacity-70 focus-visible:ring-2
                 focus-visible:ring-accent focus-visible:ring-offset-2
                 focus-visible:ring-offset-background"
      aria-label="Profile"
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
    </Link>
  )
}
