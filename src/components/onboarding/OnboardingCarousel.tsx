'use client'

import * as React from 'react'
import { X, ChevronRight, Target, Trophy, AlertCircle, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────
// Slide definitions
// ─────────────────────────────────────────────

function Slide1() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-black text-text-primary">Welcome to FX Racing</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          Before each F1 race, make three predictions:
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-elevated">
          <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
            <Target className="h-4 w-4 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">10th Place</p>
            <p className="text-xs text-text-secondary">Pick the driver who finishes P10. Up to 25 pts — the closer, the better.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-elevated">
          <div className="h-8 w-8 rounded-full bg-[#C9A227]/10 flex items-center justify-center shrink-0">
            <Trophy className="h-4 w-4 text-[#C9A227]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Winner</p>
            <p className="text-xs text-text-secondary">Pick the race winner (P1). +5 pts bonus if correct.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-elevated">
          <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">DNF / No Finish</p>
            <p className="text-xs text-text-secondary">Pick a driver who won&apos;t finish the race. +3 pts bonus if correct.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide2() {
  const mockRows = [
    { rank: 1, name: 'racefan99', pts: 47, color: '#C9A227' },
    { rank: 2, name: 'you', pts: 41, color: '#0ff', isYou: true },
    { rank: 3, name: 'speedy_v', pts: 38, color: '#9E9E9E' },
    { rank: 4, name: 'turbo_mike', pts: 30, color: null },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-black text-text-primary">Compete with Friends</h2>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          Your score accumulates across the season. Add friends and track who&apos;s topping the board.
        </p>
      </div>

      {/* Mock leaderboard */}
      <div className="rounded-2xl border border-[var(--border)] bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border)]">
          <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-widest">Ranking — Friends</p>
        </div>
        {mockRows.map((row) => (
          <div
            key={row.rank}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] last:border-0',
              row.isYou && 'bg-accent/5',
            )}
          >
            <span
              className="text-sm font-black w-5 text-center"
              style={{ color: row.color ?? 'var(--text-tertiary)' }}
            >
              {row.rank}
            </span>
            <div className="h-7 w-7 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-bold text-text-secondary shrink-0">
              {row.name[0].toUpperCase()}
            </div>
            <span className={cn(
              'flex-1 text-sm truncate',
              row.isYou ? 'font-bold text-accent' : 'font-medium text-text-secondary',
            )}>
              {row.name}{row.isYou && <span className="ml-1.5 text-xs font-normal text-text-tertiary">you</span>}
            </span>
            <span className={cn(
              'text-sm font-bold',
              row.isYou ? 'text-accent' : 'text-text-primary',
            )}>
              {row.pts} <span className="text-xs font-normal text-text-tertiary">pts</span>
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-tertiary text-center">
        Add friends from the Ranking page to compare scores head-to-head.
      </p>
    </div>
  )
}

function Slide3() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-black text-text-primary">How to Make Picks</h2>
        <p className="text-sm text-text-secondary">
          Picks are locked 30 min before race start — don&apos;t forget to save!
        </p>
      </div>

      {/* Mock pick UI */}
      <div className="rounded-2xl border border-[var(--border)] bg-surface p-4 flex flex-col gap-4">
        {/* Three bubbles */}
        <div className="flex justify-around items-end gap-2">
          {/* P10 */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center">
                <span className="text-xs font-bold text-accent text-center leading-tight">Tap<br/>to pick</span>
              </div>
              {/* Annotation */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">1. Tap here</span>
              </div>
            </div>
            <span className="text-xs font-semibold text-text-secondary">P10</span>
          </div>

          {/* Winner */}
          <div className="flex flex-col items-center gap-2">
            <div className="h-20 w-20 rounded-full bg-[#C9A227]/10 border-2 border-[#C9A227] flex items-center justify-center">
              <Trophy className="h-6 w-6 text-[#C9A227]" />
            </div>
            <span className="text-xs font-semibold text-text-secondary">Winner</span>
          </div>

          {/* DNF */}
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-full bg-red-500/10 border-2 border-red-400 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <span className="text-xs font-semibold text-text-secondary">DNF</span>
          </div>
        </div>

        {/* Driver sheet mock */}
        <div className="rounded-xl border border-[var(--border)] bg-surface-elevated overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-bold text-text-primary">Choose a driver</span>
            <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">2. Select</span>
          </div>
          {['VER', 'NOR', 'HAM'].map((code) => (
            <div key={code} className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] last:border-0">
              <div className="h-6 w-6 rounded-full bg-surface flex items-center justify-center">
                <span className="text-[10px] font-bold text-text-tertiary">{code[0]}</span>
              </div>
              <span className="text-xs font-semibold text-text-primary">{code}</span>
            </div>
          ))}
        </div>

        {/* Save button mock */}
        <div className="relative">
          <div className="w-full h-11 rounded-xl bg-accent flex items-center justify-center">
            <span className="text-sm font-bold text-white">Save Picks</span>
          </div>
          <div className="absolute -top-5 right-3">
            <span className="text-[10px] font-bold text-[#30d158] bg-[#30d158]/10 px-1.5 py-0.5 rounded-full">3. Save!</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const SLIDES = [Slide1, Slide2, Slide3]

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function OnboardingCarousel({
  initialVisible,
  mode,
}: {
  initialVisible: boolean
  mode: 'guest' | 'authenticated'
}) {
  const [visible, setVisible] = React.useState(initialVisible)
  const [slide, setSlide] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [dragStart, setDragStart] = React.useState(0)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!visible) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [visible])

  const dismiss = async () => {
    if (mode === 'guest') {
      setVisible(false)
      return
    }

    setIsSubmitting(true)
    try {
      await fetch('/api/users/tutorial', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      })
    } catch {
      // If persistence fails, still let this visit continue; the overlay will return on reload.
    } finally {
      setVisible(false)
      setIsSubmitting(false)
    }
  }

  const next = async () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1)
    } else {
      await dismiss()
    }
  }

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStart(e.touches[0].clientX)
    setDragging(true)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!dragging) return
    const delta = dragStart - e.changedTouches[0].clientX
    if (delta > 50 && slide < SLIDES.length - 1) setSlide(slide + 1)
    if (delta < -50 && slide > 0) setSlide(slide - 1)
    setDragging(false)
  }

  if (!visible) return null

  const SlideComponent = SLIDES[slide]

  return (
    <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[430px] flex-col bg-background/95">
        <div
          className="flex-1 overflow-y-auto px-6 pb-6 pt-8 select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="flex gap-1.5">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSlide(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slide ? 'bg-accent w-8' : 'bg-surface-elevated w-2',
                  )}
                  aria-label={`Go to tutorial slide ${i + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void dismiss()}
              disabled={isSubmitting}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated transition-colors hover:bg-surface-elevated/80 disabled:opacity-50"
              aria-label="Dismiss tutorial"
            >
              <X className="h-4 w-4 text-text-tertiary" />
            </button>
          </div>

          <div className="rounded-[28px] border border-[var(--border)] bg-surface p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <SlideComponent />
          </div>
        </div>

        <div className="border-t border-[var(--border)] bg-surface-elevated/60 px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSlide(Math.max(0, slide - 1))}
              className={cn(
                'text-sm font-medium text-text-tertiary transition-opacity',
                slide === 0 && 'pointer-events-none opacity-0',
              )}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void next()}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 text-sm font-bold text-accent disabled:opacity-50"
            >
              {slide === SLIDES.length - 1 ? "Let's go" : 'Next'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
