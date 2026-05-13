"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { AnimatePresence, motion, LayoutGroup } from "framer-motion"
import { CheckCircle2, Circle, Lock, Zap } from "lucide-react"
import type { SerializedRaceSummary } from "@/types/domain"

// Inline pure check — lock.service.ts also imports Prisma which can't cross
// the client boundary.
function isRaceLockedClient(lockCutoffIso: string): boolean {
  return Date.now() >= new Date(lockCutoffIso).getTime()
}

const FLAG: Record<string, string> = {
  Bahrain: "🇧🇭", "Saudi Arabia": "🇸🇦", Australia: "🇦🇺", Japan: "🇯🇵",
  China: "🇨🇳", USA: "🇺🇸", "United States": "🇺🇸", Miami: "🇺🇸",
  Italy: "🇮🇹", Monaco: "🇲🇨", Canada: "🇨🇦", Spain: "🇪🇸",
  Austria: "🇦🇹", "United Kingdom": "🇬🇧", UK: "🇬🇧", Hungary: "🇭🇺",
  Belgium: "🇧🇪", Netherlands: "🇳🇱", Singapore: "🇸🇬", Azerbaijan: "🇦🇿",
  Mexico: "🇲🇽", Brazil: "🇧🇷", "Abu Dhabi": "🇦🇪", UAE: "🇦🇪",
  Qatar: "🇶🇦", "Las Vegas": "🇺🇸",
}

function getFlag(country: string) {
  return FLAG[country] ?? "🏁"
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface RacesApiResponse {
  races: SerializedRaceSummary[]
  season: { id: string; year: number } | null
}

interface RaceCardProps {
  race: SerializedRaceSummary
  picked: boolean
  locked: boolean
}

function RaceCard({ race, picked, locked }: RaceCardProps) {
  const statusColor =
    race.status === "LIVE"
      ? "text-[#C41230]"
      : race.status === "COMPLETED"
        ? "text-text-tertiary"
        : "text-text-secondary"

  return (
    <motion.div
      layoutId={`race-card-${race.id}`}
      layout="position"
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Link
        href={`/races/${race.id}`}
        className="flex items-center gap-4 bg-surface rounded-2xl px-4 py-3.5 border border-[var(--border)] active:opacity-70 transition-opacity"
      >
        <div className="w-8 shrink-0 text-center">
          <span className="text-xs font-bold text-text-tertiary">
            R{race.round}
            {race.type === "SPRINT" ? "S" : ""}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-base leading-none">{getFlag(race.country)}</span>
            {race.type === "SPRINT" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-bold">
                <Zap className="w-2.5 h-2.5" />
                Sprint
              </span>
            )}
          </div>
          <p className="font-semibold text-text-primary text-sm leading-tight truncate">
            {race.name}
          </p>
          <p className={`text-xs mt-0.5 ${statusColor}`}>
            {race.status === "LIVE"
              ? "Live now"
              : race.status === "COMPLETED"
                ? "Completed"
                : formatDate(race.scheduledStartUtc)}
          </p>
        </div>

        <div className="shrink-0">
          {locked ? (
            <Lock className="w-4 h-4 text-text-tertiary" />
          ) : picked ? (
            <CheckCircle2 className="w-5 h-5 text-[#1A9640]" />
          ) : (
            <Circle className="w-5 h-5 text-text-tertiary" />
          )}
        </div>
      </Link>
    </motion.div>
  )
}

interface RacesListClientProps {
  initialRaces: SerializedRaceSummary[]
  pickedIds: string[]
}

export function RacesListClient({
  initialRaces,
  pickedIds,
}: RacesListClientProps) {
  const pickedSet = React.useMemo(() => new Set(pickedIds), [pickedIds])

  // Determine the polling interval based on the *current* races. If anything
  // is LIVE we poll every 60s; otherwise we don't poll (SWR refresh on focus
  // is enough).
  const hasLiveInitial = initialRaces.some((r) => r.status === "LIVE")

  const { data } = useSWR<RacesApiResponse>("/api/races", fetcher, {
    fallbackData: { races: initialRaces, season: null },
    refreshInterval: hasLiveInitial ? 60_000 : 0,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
  })

  const races = data?.races ?? initialRaces

  const upcoming = races.filter(
    (r) => r.status === "UPCOMING" || r.status === "LIVE",
  )
  const completed = races.filter((r) => r.status === "COMPLETED")

  const lockedFor = React.useCallback(
    (race: SerializedRaceSummary) => isRaceLockedClient(race.lockCutoffUtc),
    [],
  )

  return (
    <LayoutGroup>
      {upcoming.length > 0 && (
        <section className="mb-5">
          <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest mb-2 px-1">
            Upcoming
          </p>
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {upcoming.map((race) => (
                <RaceCard
                  key={race.id}
                  race={race}
                  picked={pickedSet.has(race.id)}
                  locked={lockedFor(race)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest mb-2 px-1">
            Results
          </p>
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {completed.map((race) => (
                <RaceCard
                  key={race.id}
                  race={race}
                  picked={pickedSet.has(race.id)}
                  locked={lockedFor(race)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {races.length === 0 && (
        <div className="flex items-center justify-center min-h-[50vh] text-center">
          <p className="text-text-secondary text-sm">No races scheduled yet</p>
        </div>
      )}
    </LayoutGroup>
  )
}
