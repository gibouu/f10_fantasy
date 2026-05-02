import { auth } from "@/auth"
import { getRaceById, getRaceEntrants, getRaceResults } from "@/lib/services/race.service"
import { getPickForRace } from "@/lib/services/pick.service"
import { getQualifyingResults } from "@/lib/services/qualifying.service"
import { resolvePickAgainstEntrants } from "@/lib/services/pick-resolution"
import { isRaceLocked } from "@/lib/services/lock.service"
import { PickHero } from "@/components/picks/PickHero"
import { HeroVisualization } from "@/components/race/HeroVisualization"
import { PicksDisplay } from "@/components/picks/PicksDisplay"
import { RaceResultsCard } from "@/components/race/RaceResultsCard"
import { QualifyingResultsCard } from "@/components/race/QualifyingResultsCard"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import type {
  SerializedRaceSummary,
  SerializedPickSetWithScore,
  SerializedPickSetData,
  DriverSummary,
} from "@/types/domain"
import { RaceStatus } from "@/types/domain"

export default async function RacePickPage({
  params,
}: {
  params: { raceId: string }
}) {
  const session = await auth()
  const userId = session?.user?.id ?? null

  const race = await getRaceById(params.raceId)
  if (!race) notFound()

  const [entrants, existingPick, qualifyingResults] = await Promise.all([
    getRaceEntrants(race.id),
    userId ? getPickForRace(userId, race.id) : Promise.resolve(null),
    getQualifyingResults(race.id),
  ])
  const resolvedPick =
    existingPick ? resolvePickAgainstEntrants(existingPick, entrants) : null

  const locked = isRaceLocked(race)

  // Fetch race results for completed races
  const raceResultsData =
    race.status === RaceStatus.COMPLETED ? await getRaceResults(race.id) : []
  const rawResults = raceResultsData[0]?.results ?? []

  const raceSerialized: SerializedRaceSummary = {
    ...race,
    scheduledStartUtc: race.scheduledStartUtc.toISOString(),
    lockCutoffUtc: race.lockCutoffUtc.toISOString(),
  }

  const pickSerialized: SerializedPickSetWithScore | null = resolvedPick
    ? {
        ...resolvedPick,
        createdAt: resolvedPick.createdAt.toISOString(),
        updatedAt: resolvedPick.updatedAt.toISOString(),
        lockedAt: resolvedPick.lockedAt?.toISOString() ?? null,
        race: {
          ...resolvedPick.race,
          scheduledStartUtc: resolvedPick.race.scheduledStartUtc.toISOString(),
          lockCutoffUtc: resolvedPick.race.lockCutoffUtc.toISOString(),
        },
        scoreBreakdown: resolvedPick.scoreBreakdown
          ? {
              ...resolvedPick.scoreBreakdown,
              computedAt: resolvedPick.scoreBreakdown.computedAt.toISOString(),
            }
          : null,
      }
    : null

  const pickDataSerialized: SerializedPickSetData | null = pickSerialized

  // Build entrant lookup for resolving result drivers
  const entrantMap = new Map<string, DriverSummary>(entrants.map((e) => [e.id, e]))

  // Structured results for HeroVisualization
  const heroResults =
    rawResults.length > 0
      ? (() => {
          const winnerRaw = rawResults.find((r) => r.position === 1)
          const tenthRaw = rawResults.find(
            (r) => r.position === 10 && r.status === "CLASSIFIED",
          )
          const dnfRaw = rawResults.find((r) => r.status === "DNF")

          const winnerDriver = winnerRaw ? (entrantMap.get(winnerRaw.driverId) ?? null) : null
          const tenthDriver = tenthRaw ? (entrantMap.get(tenthRaw.driverId) ?? null) : null
          const dnfDriver = dnfRaw ? (entrantMap.get(dnfRaw.driverId) ?? null) : null

          if (!winnerDriver) return undefined
          return {
            tenthPlace: tenthDriver ? { driver: tenthDriver, position: 10 } : null!,
            winner: { driver: winnerDriver },
            dnf: dnfDriver ? { driver: dnfDriver } : null,
          }
        })()
      : undefined

  // Flat results for PicksDisplay
  const displayResults = rawResults.map((r) => ({
    driverId: r.driverId,
    position: r.position,
    status: r.status as string,
  }))

  const showResults =
    race.status === RaceStatus.COMPLETED || existingPick?.scoreBreakdown != null

  return (
    <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
      {/* Back link */}
      <Link
        href="/races"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        All races
      </Link>

      {showResults ? (
        <>
          <HeroVisualization
            race={raceSerialized}
            pick={pickSerialized}
            results={heroResults}
            entrants={entrants}
          />
          {userId ? (
            <PicksDisplay
              pick={pickSerialized}
              race={raceSerialized}
              results={displayResults}
              entrants={entrants}
            />
          ) : (
            <div className="rounded-2xl bg-surface border border-[var(--border)] p-4 text-center">
              <p className="text-sm text-text-secondary mb-3">Sign in to see your picks and score</p>
              <Link
                href={`/signin?callbackUrl=/races/${params.raceId}`}
                className="inline-flex items-center justify-center rounded-xl bg-accent text-white text-sm font-semibold px-5 py-2.5"
              >
                Sign in
              </Link>
            </div>
          )}
          <RaceResultsCard
            results={rawResults}
            entrants={entrants}
            raceType={race.type}
          />
          {qualifyingResults.length > 0 && (
            <QualifyingResultsCard
              results={qualifyingResults}
              entrants={entrants}
              raceType={race.type}
            />
          )}
        </>
      ) : (
        <>
          <PickHero
            race={raceSerialized}
            entrants={entrants}
            existingPick={pickDataSerialized}
            isLocked={locked}
            requiresSignIn={!userId}
          />
          {qualifyingResults.length > 0 && (
            <QualifyingResultsCard
              results={qualifyingResults}
              entrants={entrants}
              raceType={race.type}
            />
          )}
        </>
      )}
    </div>
  )
}
