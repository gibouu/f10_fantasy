"use client"

import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="17" height="20" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
      <path d="M13.769 10.57c-.02-2.117 1.732-3.14 1.81-3.19C14.554 5.63 12.43 5.37 11.665 5.35c-1.727-.176-3.386 1.025-4.265 1.025-.893 0-2.253-1.005-3.71-.977-1.9.029-3.657 1.107-4.632 2.802C-2.99 11.25-.659 16.85 1.365 19.75c1.003 1.44 2.19 3.058 3.753 2.998 1.513-.06 2.083-.972 3.91-.972 1.828 0 2.349.972 3.938.942 1.63-.027 2.66-1.463 3.653-2.91a14.73 14.73 0 0 0 1.663-3.35c-.038-.016-3.185-1.22-3.513-4.888ZM10.51 3.48c.82-.996 1.374-2.37 1.222-3.748-1.181.048-2.64.788-3.49 1.782-.757.878-1.43 2.3-1.253 3.64 1.326.103 2.685-.675 3.521-1.674Z" />
    </svg>
  )
}

export default function SignInClient({ appleEnabled }: { appleEnabled: boolean }) {
  const searchParams = useSearchParams()
  const callbackUrlParam = searchParams.get("callbackUrl")
  const callbackUrl =
    callbackUrlParam && callbackUrlParam.startsWith("/") && !callbackUrlParam.startsWith("//")
      ? callbackUrlParam
      : "/races"

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 relative overflow-hidden">
      {/* Subtle radial accent at top */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #C41230 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <motion.div
        className="w-full max-w-sm flex flex-col items-center gap-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-1 pt-8">
          <div className="flex items-baseline gap-2">
            <span className="text-accent font-black text-6xl tracking-tighter leading-none">F10</span>
          </div>
          <span className="text-text-secondary font-semibold text-sm tracking-widest uppercase">Racing</span>
          <p className="mt-3 text-text-secondary text-center text-sm leading-relaxed">
            The F1 prediction game where 10th place wins
          </p>
        </div>

        {/* Auth buttons */}
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl
                       bg-white text-text-primary font-semibold text-sm border border-black/10
                       shadow-sm transition-opacity active:opacity-80 hover:opacity-90"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {appleEnabled && (
            <button
              onClick={() => signIn("apple", { callbackUrl })}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl
                         bg-white text-text-primary font-semibold text-sm border border-black/10
                         shadow-sm transition-opacity active:opacity-80 hover:opacity-90"
            >
              <AppleIcon />
              Continue with Apple
            </button>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-text-tertiary text-xs text-center leading-relaxed px-4">
          By continuing you agree to our{" "}
          <span className="underline underline-offset-2 cursor-pointer hover:text-text-secondary transition-colors">Terms</span>
          {" "}&amp;{" "}
          <span className="underline underline-offset-2 cursor-pointer hover:text-text-secondary transition-colors">Privacy Policy</span>
        </p>
      </motion.div>

      {/* Subtle gradient at bottom */}
      <div
        className="pointer-events-none absolute bottom-0 inset-x-0 h-32"
        style={{ background: "linear-gradient(to top, rgba(196,18,48,0.04) 0%, transparent 100%)" }}
        aria-hidden="true"
      />
    </div>
  )
}
