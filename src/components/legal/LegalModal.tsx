'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const SUPPORT_EMAIL = 'support@fxracing.ca'

const TABS = ['Privacy', 'Terms', 'IP Notice', 'Cookies', 'Support'] as const
type Tab = typeof TABS[number]

const CONTENT: Record<Tab, React.ReactNode> = {
  Privacy: (
    <div className="flex flex-col gap-4 text-sm text-text-secondary leading-relaxed">
      <p>
        FX Racing respects your privacy. We collect only the information necessary to operate the
        app and provide core functionality, such as account authentication, syncing picks across
        devices, friend features, and app performance monitoring.
      </p>
      <p>
        We do not sell personal data. We do not use personal information for advertising purposes.
        Information may be processed only to operate, secure, maintain, and improve the app
        experience.
      </p>
      <p>
        If you sign in, your account information is used solely for authentication, saving your
        picks, and enabling social features such as adding friends and syncing across devices.
      </p>
      <p>
        By using the app, you acknowledge that data may be processed for these limited operational
        purposes.
      </p>
      <p>
        For privacy-related questions, contact:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 text-accent">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  ),

  Terms: (
    <div className="flex flex-col gap-4 text-sm text-text-secondary leading-relaxed">
      <p>
        FX Racing is a fan-made motorsport prediction game intended for entertainment purposes only.
        The app allows users to make race-related picks and compete with friends in a private,
        recreational format.
      </p>
      <p>
        The app is provided &quot;as is&quot; without warranties of any kind, to the fullest extent
        permitted by applicable law. We do not guarantee uninterrupted availability, error-free
        operation, or absolute accuracy of all content, standings, or results.
      </p>
      <p>
        Users agree to use the app lawfully and respectfully. We may suspend or remove access in
        cases of abuse, misuse, interference with the service, or violations of these terms.
      </p>
    </div>
  ),

  'IP Notice': (
    <div className="flex flex-col gap-4 text-sm text-text-secondary leading-relaxed">
      <p>
        FX Racing is an unofficial, fan-created application and is not affiliated with, endorsed
        by, sponsored by, or approved by Formula 1, any Formula 1 team, any driver, or any related
        rights holder.
      </p>
      <p>
        Team names, driver names, logos, trademarks, images, colors, and other visual references
        remain the property of their respective owners.
      </p>
      <p>
        Any such references within the app are used solely for identification, commentary, and
        fan-experience presentation. If you are a rights holder and believe any content should be
        removed or modified, please contact{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 text-accent">
          {SUPPORT_EMAIL}
        </a>{' '}
        and we will review the request promptly.
      </p>
    </div>
  ),

  Cookies: (
    <div className="flex flex-col gap-4 text-sm text-text-secondary leading-relaxed">
      <p>
        FX Racing uses strictly necessary cookies to operate core functionality. These are not used
        for tracking or advertising.
      </p>
      <ul className="list-disc list-inside flex flex-col gap-1">
        <li>
          <span className="font-medium text-text-primary">Session cookie</span> — keeps you signed
          in while you use the app. Expires when your session ends or after 30 days.
        </li>
        <li>
          <span className="font-medium text-text-primary">CSRF token</span> — protects form
          submissions from cross-site request forgery.
        </li>
      </ul>
      <p>
        No third-party cookies, analytics cookies, or advertising cookies are placed. You can clear
        cookies at any time through your browser settings; doing so will sign you out.
      </p>
    </div>
  ),

  Support: (
    <div className="flex flex-col gap-4 text-sm text-text-secondary leading-relaxed">
      <p>For support, bug reports, or legal inquiries, contact:</p>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="font-semibold text-accent underline underline-offset-2"
      >
        {SUPPORT_EMAIL}
      </a>
      <p>We are here to help.</p>
    </div>
  ),
}

export function LegalModal() {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<Tab>('Privacy')

  // Reset tab when reopening
  const handleOpen = () => {
    setTab('Privacy')
    setOpen(true)
  }

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setOpen(false)
  }

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 py-6 text-text-tertiary">
        <span className="text-xs">© FX Racing 2026</span>
        <span className="text-xs opacity-40">·</span>
        <button
          type="button"
          onClick={handleOpen}
          className="text-xs hover:text-text-secondary transition-colors"
        >
          boring legal stuff
        </button>
      </div>

      {/* ── Modal ───────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
          onClick={handleBackdrop}
        >
          <div className="w-full max-w-[400px] rounded-[28px] bg-surface shadow-[0_32px_96px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden max-h-[80vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <span className="text-sm font-bold text-text-primary">Legal &amp; Support</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated hover:bg-surface-elevated/80 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-text-tertiary" />
              </button>
            </div>

            {/* Tab strip */}
            <div className="flex gap-1.5 px-5 pb-3 shrink-0 overflow-x-auto no-scrollbar">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                    tab === t
                      ? 'bg-accent text-white'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="border-t border-[var(--border)] shrink-0" />

            {/* Scrollable content */}
            <div className="overflow-y-auto px-5 py-5">
              {CONTENT[tab]}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
