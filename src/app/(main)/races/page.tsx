import { auth } from "@/auth"
import { getActiveSeason, getRacesForSeason } from "@/lib/services/race.service"
import { getPickedRaceIds } from "@/lib/services/pick.service"
import { hasDismissedTutorial } from "@/lib/services/user.service"
import { isRaceLocked } from "@/lib/services/lock.service"
import Link from "next/link"
import { CheckCircle2, Circle, Lock, Zap } from "lucide-react"
import type { RaceSummary } from "@/types/domain"
import { OnboardingCarousel } from "@/components/onboarding/OnboardingCarousel"

// Country → flag emoji map
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

interface RaceCardProps {
  race: RaceSummary & { scheduledStartUtc: Date; lockCutoffUtc: Date }
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
    <Link
      href={`/races/${race.id}`}
      className="flex items-center gap-4 bg-surface rounded-2xl px-4 py-3.5 border border-[var(--border)] active:opacity-70 transition-opacity"
    >
      {/* Round number */}
      <div className="w-8 shrink-0 text-center">
        <span className="text-xs font-bold text-text-tertiary">R{race.round}</span>
      </div>

      {/* Flag + info */}
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
            : formatDate(race.scheduledStartUtc.toISOString())}
        </p>
      </div>

      {/* Pick status */}
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
  )
}

export default async function RacesPage() {
  // Run auth + season fetch in parallel — they're independent.
  const [session, season] = await Promise.all([auth(), getActiveSeason()])
  const userId = session?.user?.id ?? null

  if (!season) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-text-secondary text-sm">No active season</p>
      </div>
    )
  }

  // Batch all per-user and per-season queries together.
  const [races, pickedIds, tutorialDismissed] = await Promise.all([
    getRacesForSeason(season.id),
    userId ? getPickedRaceIds(userId, season.id) : Promise.resolve(new Set<string>()),
    userId ? hasDismissedTutorial(userId) : Promise.resolve(false),
  ])

  const upcoming = races.filter((r) => r.status === "UPCOMING" || r.status === "LIVE")
  const completed = races.filter((r) => r.status === "COMPLETED")

  return (
    <div className="px-4 pt-4 pb-6">
      <OnboardingCarousel
        initialVisible={!tutorialDismissed}
        mode={userId ? "authenticated" : "guest"}
      />

      {/* Season header */}
      <div className="mb-4">
        <h1 className="text-xl font-black text-text-primary tracking-tight">
          {season.year} Season
        </h1>
        {userId && (
          <p className="text-xs text-text-secondary mt-0.5">
            {pickedIds.size} / {races.length} races picked
          </p>
        )}
      </div>

      {/* Upcoming races */}
      {upcoming.length > 0 && (
        <section className="mb-5">
          <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest mb-2 px-1">
            Upcoming
          </p>
          <div className="flex flex-col gap-2">
            {upcoming.map((race) => (
              <RaceCard
                key={race.id}
                race={race}
                picked={pickedIds.has(race.id)}
                locked={isRaceLocked(race)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Completed races */}
      {completed.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest mb-2 px-1">
            Results
          </p>
          <div className="flex flex-col gap-2">
            {completed.map((race) => (
              <RaceCard
                key={race.id}
                race={race}
                picked={pickedIds.has(race.id)}
                locked={isRaceLocked(race)}
              />
            ))}
          </div>
        </section>
      )}

      {races.length === 0 && (
        <div className="flex items-center justify-center min-h-[50vh] text-center">
          <p className="text-text-secondary text-sm">No races scheduled yet</p>
        </div>
      )}
    </div>
  )
}
