import * as React from 'react'
import Image from 'next/image'

import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────
// Size map
// ─────────────────────────────────────────────

const SIZE_MAP = {
  sm: 24,
  md: 36,
  lg: 48,
  xl: 64,
} as const

type AvatarSize = keyof typeof SIZE_MAP

// ─────────────────────────────────────────────
// Deterministic muted color from name string
// ─────────────────────────────────────────────

/** Muted flat colors inspired by F1 team palette backgrounds */
const MUTED_COLORS = [
  '#D4A5A5', // muted red
  '#A5B4D4', // muted blue
  '#A5D4BC', // muted teal
  '#D4C5A5', // muted orange/sand
  '#C5A5D4', // muted purple
  '#A5C5D4', // muted cyan
  '#D4A5C5', // muted pink
  '#B4D4A5', // muted green
  '#D4B4A5', // muted coral
  '#A5A5D4', // muted indigo
]

/** Simple djb2-inspired hash to pick a color deterministically. */
function nameHash(name: string): number {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33) ^ name.charCodeAt(i)
  }
  return Math.abs(hash)
}

function colorForName(name: string): string {
  return MUTED_COLORS[nameHash(name) % MUTED_COLORS.length]
}

// ─────────────────────────────────────────────
// Initials
// ─────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export interface AvatarProps {
  /** URL of the avatar image */
  src?: string | null
  /** Full name — used for initials and gradient seed */
  name: string
  size?: AvatarSize
  /** Hex team color — adds a 2px ring in that color */
  color?: string
  /** Team logo URL — shown on the team color background instead of initials */
  teamLogoUrl?: string | null
  /** Team color for the logo background */
  teamColor?: string | null
  className?: string
}

export function Avatar({
  src,
  name,
  size = 'md',
  color,
  teamLogoUrl,
  teamColor,
  className,
}: AvatarProps) {
  const px = SIZE_MAP[size]
  const fontSize =
    size === 'sm' ? 'text-[10px]' :
    size === 'md' ? 'text-sm' :
    size === 'lg' ? 'text-base' :
    'text-xl'

  const ringStyle: React.CSSProperties = color
    ? { boxShadow: `0 0 0 2px ${color}` }
    : {}

  // Team logo variant — shown on a darkened team-color background
  const teamBgColor = teamColor ? `${teamColor}33` : '#1c1c1e'

  return (
    <div
      className={cn('rounded-full overflow-hidden shrink-0 relative', className)}
      style={{ width: px, height: px, ...ringStyle }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={px}
          height={px}
          className="object-cover w-full h-full"
        />
      ) : teamLogoUrl ? (
        <div
          className="w-full h-full flex items-center justify-center p-1"
          style={{ backgroundColor: teamBgColor }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teamLogoUrl}
            alt={name}
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div
          className={cn('w-full h-full flex items-center justify-center', fontSize, 'font-semibold')}
          style={{ backgroundColor: colorForName(name), color: '#1a1a1a' }}
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  )
}
