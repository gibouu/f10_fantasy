"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"

type Step = "idle" | "warn" | "confirm"

export function DeleteAccountButton() {
  const [step, setStep] = useState<Step>("idle")
  const [answer, setAnswer] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAnswerCorrect = answer.trim() === "4"

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/account", { method: "DELETE" })
      if (!res.ok) throw new Error("Deletion failed")
      await signOut({ callbackUrl: "/signin" })
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setStep("warn")}
        className="w-full py-3 text-sm font-medium text-red-500/70 rounded-2xl
                   border border-red-500/10 bg-red-500/5
                   hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        Delete Account
      </button>

      {/* Modal overlay */}
      {step !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { setStep("idle"); setAnswer(""); setError(null) }}
          />

          {/* Panel */}
          <div className="relative w-full max-w-sm bg-surface rounded-3xl p-6 flex flex-col gap-5 shadow-2xl">
            {step === "warn" && (
              <>
                <div className="flex flex-col gap-2">
                  <h2 className="text-base font-bold text-text-primary">Delete Account?</h2>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    This permanently deletes your account and all associated data — your picks,
                    scores, and friends list. This action cannot be undone.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setStep("confirm")}
                    className="w-full py-3 rounded-2xl text-sm font-semibold
                               bg-red-500 text-white hover:bg-red-600 transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => setStep("idle")}
                    className="w-full py-3 rounded-2xl text-sm font-medium
                               text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <div className="flex flex-col gap-2">
                  <h2 className="text-base font-bold text-text-primary">Confirm Deletion</h2>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    To confirm, answer: <span className="font-semibold text-text-primary">2 + 2</span>
                  </p>
                </div>

                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Your answer"
                  value={answer}
                  onChange={(e) => { setAnswer(e.target.value); setError(null) }}
                  className="w-full px-4 py-3 rounded-xl bg-black/10 text-text-primary
                             text-sm border border-white/10 outline-none
                             focus:border-white/30 transition-colors"
                  autoFocus
                />

                {error && (
                  <p className="text-xs text-red-400 text-center">{error}</p>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={!isAnswerCorrect || loading}
                    className="w-full py-3 rounded-2xl text-sm font-semibold transition-colors
                               disabled:opacity-40 disabled:cursor-not-allowed
                               bg-red-500 text-white hover:bg-red-600 disabled:hover:bg-red-500"
                  >
                    {loading ? "Deleting…" : "Permanently Delete Account"}
                  </button>
                  <button
                    onClick={() => { setStep("idle"); setAnswer(""); setError(null) }}
                    disabled={loading}
                    className="w-full py-3 rounded-2xl text-sm font-medium
                               text-text-secondary hover:text-text-primary transition-colors
                               disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
