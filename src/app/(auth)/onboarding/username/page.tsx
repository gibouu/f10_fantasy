"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

// ─── Validation (mirrors server-side rules) ───────────────────────────────────

function validateUsername(value: string): string | null {
  if (value.length < 3) return "Must be at least 3 characters"
  if (value.length > 20) return "Must be 20 characters or fewer"
  if (!/^[a-zA-Z0-9]+$/.test(value)) return "Only letters and numbers allowed."
  return null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-success" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsernameOnboardingPage() {
  const router = useRouter()
  const { update } = useSession()

  const [username, setUsername] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  // Ref to cancel stale availability checks
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch suggestions once on mount
  useEffect(() => {
    fetch("/api/users/suggest-usernames")
      .then((r) => r.json())
      .then((data: { suggestions: string[] }) => setSuggestions(data.suggestions))
      .catch(() => {
        // Suggestions are non-critical — silently ignore network errors
      })
  }, [])

  // Debounced availability check: fires 400ms after the user stops typing
  const checkAvailability = useCallback((value: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    const formatError = validateUsername(value)
    if (formatError || value.length === 0) {
      setIsAvailable(null)
      setIsChecking(false)
      return
    }

    setIsChecking(true)
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/username?username=${encodeURIComponent(value)}`,
        )
        const data: { available: boolean } = await res.json()
        setIsAvailable(data.available)
        if (!data.available) {
          setError("Username already taken.")
        } else {
          setError(null)
        }
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
    setError(null)

    const formatError = validateUsername(value)
    if (formatError) {
      setError(formatError)
      return
    }

    checkAvailability(value)
  }

  function handleSuggestionClick(suggestion: string) {
    setUsername(suggestion)
    setError(null)
    checkAvailability(suggestion)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const formatError = validateUsername(username)
    if (formatError) {
      setError(formatError)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/users/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      })

      if (res.status === 409) {
        setError("Username already taken.")
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? "Something went wrong")
        return
      }

      // Refresh the Auth.js session so usernameSet becomes true in the token.
      // The middleware will then allow navigation beyond /onboarding.
      await update({ usernameSet: true, publicUsername: username })
      router.push("/races")
    } catch {
      setError("Network error — please try again")
    } finally {
      setIsSubmitting(false)
    }
  }

  // The submit button is only enabled when the username passes all checks
  const canSubmit =
    !error &&
    !isChecking &&
    isAvailable === true &&
    validateUsername(username) === null

  return (
    <div className="flex flex-col min-h-screen px-6 pt-16 pb-8">
      <div className="flex-1 flex flex-col gap-6 max-w-sm w-full mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-text-primary font-bold text-2xl tracking-tight">
            Choose your username
          </h1>
          <p className="mt-1.5 text-text-secondary text-sm leading-relaxed">
            This is how other players will find and know you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Input */}
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="e.g. TurboFalcon42"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={20}
                className="w-full px-4 py-3 pr-10 rounded-2xl bg-surface-elevated
                           text-text-primary placeholder:text-text-tertiary
                           border border-[var(--border)] focus:border-accent
                           outline-none transition-colors text-base"
              />
              {/* Trailing indicator */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isChecking && (
                  <div className="w-4 h-4 rounded-full border-2 border-text-tertiary border-t-transparent animate-spin" />
                )}
                {!isChecking && isAvailable === true && <CheckIcon />}
              </div>
            </div>

            {/* Error / availability feedback */}
            {error && (
              <p className="text-[#ff453a] text-xs px-1">{error}</p>
            )}
            {!error && isAvailable === false && !isChecking && (
              <p className="text-[#ff453a] text-xs px-1">Username already taken.</p>
            )}
            {!error && isAvailable === true && !isChecking && (
              <p className="text-success text-xs px-1">Available!</p>
            )}
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-text-tertiary text-xs font-medium uppercase tracking-wide">
                Suggestions
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestionClick(s)}
                    className="pill bg-surface-elevated text-text-secondary border border-[var(--border)]
                               hover:border-accent hover:text-text-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="btn-primary w-full mt-2"
          >
            {isSubmitting ? "Claiming…" : "Claim username"}
          </button>
        </form>
      </div>
    </div>
  )
}
