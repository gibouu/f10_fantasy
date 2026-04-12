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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.46 2.208 3.09 3.792 3.032 1.52-.065 2.09-.987 3.925-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.391-2.376-2-.156-3.675 1.09-4.6 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
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
  const authError = searchParams.get("error")

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

        {authError && (
          <div className="w-full rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-red-400">Sign-in failed — please try again.</p>
          </div>
        )}

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
