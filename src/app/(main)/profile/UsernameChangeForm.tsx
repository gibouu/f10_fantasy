'use client'

import { useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { CheckCircle2 } from 'lucide-react'

function validateUsername(value: string): string | null {
  if (value.length < 3) return 'Must be at least 3 characters'
  if (value.length > 20) return 'Must be 20 characters or fewer'
  if (!/^[a-zA-Z0-9]+$/.test(value)) return 'Only letters and numbers allowed.'
  return null
}

export function UsernameChangeForm({ currentUsername }: { currentUsername: string }) {
  const { update } = useSession()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkAvailability = useCallback((value: string) => {
    if (debounce.current) clearTimeout(debounce.current)
    const fmt = validateUsername(value)
    if (fmt || !value) { setIsAvailable(null); setIsChecking(false); return }
    setIsChecking(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/username?username=${encodeURIComponent(value)}`)
        const data: { available: boolean } = await res.json()
        setIsAvailable(data.available)
        if (!data.available) setError('Username already taken.')
        else setError(null)
      } catch {
        setIsAvailable(null)
        setError("Couldn't verify username. Please try again.")
      } finally {
        setIsChecking(false)
      }
    }, 400)
  }, [])

  function handleChange(value: string) {
    setUsername(value)
    setIsAvailable(null)
    const fmt = validateUsername(value)
    setError(fmt)
    if (!fmt) checkAvailability(value)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/users/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (res.status === 409) { setError('Username already taken.'); return }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Something went wrong')
        return
      }
      await update({ publicUsername: username })
      setDone(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = !error && !isChecking && isAvailable === true && validateUsername(username) === null

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#30d158]">
        <CheckCircle2 className="w-4 h-4" />
        Username changed to @{username}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <p className="text-xs text-text-secondary">
        Current username: <span className="font-semibold text-text-primary">@{currentUsername}</span>
      </p>
      <p className="text-xs text-text-tertiary">This is a one-time change — choose carefully.</p>
      <div className="relative">
        <input
          type="text"
          value={username}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="New username"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={20}
          className="w-full px-4 py-3 pr-10 rounded-2xl bg-surface-elevated
                     text-text-primary placeholder:text-text-tertiary
                     border border-[var(--border)] focus:border-accent
                     outline-none transition-colors text-sm"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isChecking && (
            <div className="w-4 h-4 rounded-full border-2 border-text-tertiary border-t-transparent animate-spin" />
          )}
          {!isChecking && isAvailable === true && (
            <CheckCircle2 className="w-5 h-5 text-[#30d158]" />
          )}
        </div>
      </div>
      {error && <p className="text-[#ff453a] text-xs px-1">{error}</p>}
      {!error && isAvailable === true && (
        <p className="text-[#30d158] text-xs px-1">Available!</p>
      )}
      <button
        type="submit"
        disabled={!canSubmit || isSubmitting}
        className="btn-primary w-full"
      >
        {isSubmitting ? 'Saving…' : 'Change username'}
      </button>
    </form>
  )
}
