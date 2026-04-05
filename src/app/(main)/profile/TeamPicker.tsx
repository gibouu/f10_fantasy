'use client'

import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeamInfo } from '@/lib/f1/teams'

interface TeamPickerProps {
  teams: TeamInfo[]
  initialSlug: string | null
}

export function TeamPicker({ teams, initialSlug }: TeamPickerProps) {
  const [selected, setSelected] = React.useState<string | null>(initialSlug)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function pick(slug: string | null) {
    const next = selected === slug ? null : slug
    setSelected(next)
    setStatus('saving')

    try {
      const res = await fetch('/api/users/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: next }),
      })
      if (!res.ok) throw new Error()
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
    } catch {
      setSelected(selected) // revert
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {teams.map((team) => {
          const isSelected = selected === team.slug
          return (
            <button
              key={team.slug}
              type="button"
              onClick={() => pick(team.slug)}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all',
                'disabled:opacity-50',
                isSelected
                  ? 'border-[var(--accent)] bg-surface-elevated'
                  : 'border-[var(--border)] bg-surface hover:border-[rgba(128,128,128,0.4)]',
              )}
            >
              {/* Team logo on brand-color background */}
              <div
                className="w-12 h-8 rounded-lg flex items-center justify-center p-1.5"
                style={{ backgroundColor: team.color + '22' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold leading-none text-center',
                  isSelected ? 'text-text-primary' : 'text-text-secondary',
                )}
              >
                {team.name}
              </span>
              {isSelected && (
                <CheckCircle2 className="h-3.5 w-3.5 text-accent absolute top-2 right-2" />
              )}
            </button>
          )
        })}
      </div>

      {/* Status feedback */}
      {status === 'saving' && (
        <p className="text-xs text-text-tertiary text-center">Saving…</p>
      )}
      {status === 'saved' && (
        <p className="text-xs text-[#30d158] text-center">Team updated!</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-accent text-center">Failed to save — try again.</p>
      )}
    </div>
  )
}
