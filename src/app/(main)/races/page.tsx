import { auth } from "@/auth"
import { getActiveSeason, getRacesForSeason } from "@/lib/services/race.service"
import { getPickedRaceIds } from "@/lib/services/pick.service"
import { hasDismissedTutorial } from "@/lib/services/user.service"
import { OnboardingCarousel } from "@/components/onboarding/OnboardingCarousel"
import { RacesListClient } from "./RacesListClient"
import type { SerializedRaceSummary } from "@/types/domain"

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

  const initialRaces: SerializedRaceSummary[] = races.map((r) => ({
    ...r,
    scheduledStartUtc: r.scheduledStartUtc.toISOString(),
    lockCutoffUtc: r.lockCutoffUtc.toISOString(),
  }))

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

      <RacesListClient
        initialRaces={initialRaces}
        pickedIds={Array.from(pickedIds)}
      />
    </div>
  )
}
