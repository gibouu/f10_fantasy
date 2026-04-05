import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full font-medium shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-surface-elevated text-text-secondary',
        accent: 'bg-accent text-white',
        success: 'bg-[#30d15820] text-[#30d158]',
        warning: 'bg-[#ff9f0a20] text-[#ff9f0a]',
        // 'team' variant uses inline styles via the `color` prop — see Badge component below
        team: '',
      },
      size: {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-3 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * Hex color (e.g. "#E8002D") used only when variant="team".
   * Applied as a background at 20% opacity with the full color as text.
   */
  color?: string
}

function Badge({
  className,
  variant,
  size,
  color,
  style,
  ...props
}: BadgeProps) {
  // Build inline style for team variant
  const teamStyle: React.CSSProperties =
    variant === 'team' && color
      ? {
          backgroundColor: `${color}33`, // ~20% opacity
          color: color,
          ...style,
        }
      : { ...style }

  return (
    <span
      className={cn(badgeVariants({ variant, size, className }))}
      style={teamStyle}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
