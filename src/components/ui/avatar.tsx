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
// Deterministic gradient from name string
// ─────────────────────────────────────────────

const GRADIENTS = [
  'from-[#FF6B6B] to-[#FF8E53]',
  'from-[#4FACFE] to-[#00F2FE]',
  'from-[#43E97B] to-[#38F9D7]',
  'from-[#FA709A] to-[#FEE140]',
  'from-[#A18CD1] to-[#FBC2EB]',
  'from-[#FD746C] to-[#FF9068]',
  'from-[#667EEA] to-[#764BA2]',
  'from-[#F093FB] to-[#F5576C]',
  'from-[#4481EB] to-[#04BEFE]',
  'from-[#0BA360] to-[#3CBA92]',
]

/** Simple djb2-inspired hash to pick a gradient deterministically. */
function nameHash(name: string): number {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33) ^ name.charCodeAt(i)
  }
  return Math.abs(hash)
}

function gradientForName(name: string): string {
  return GRADIENTS[nameHash(name) % GRADIENTS.length]
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
          className={cn(
            'w-full h-full flex items-center justify-center bg-gradient-to-br',
            gradientForName(name),
            fontSize,
            'font-semibold text-white',
          )}
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  )
}
