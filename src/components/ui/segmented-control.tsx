'use client'

import * as React from 'react'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

export interface SegmentedControlOption {
  value: string
  label: string
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        'flex items-center w-full rounded-full p-1 bg-surface-elevated',
        className,
      )}
      role="group"
    >
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex-1 py-1.5 text-sm font-medium rounded-full transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated',
              isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {/* Sliding indicator — sits behind label text */}
            {isActive && (
              <motion.span
                layoutId="segmented-control-pill"
                className="absolute inset-0 rounded-full bg-[rgba(0,0,0,0.07)] shadow-sm"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
