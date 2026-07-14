import SwiftUI

enum RaceContextKind: Equatable, Sendable {
    case previousRace
    case qualifying
    case results
    case scoreSummary
    case unavailable

    static func resolve(
        section: RaceDeckSection,
        hasQualifyingRows: Bool,
        hasResults: Bool,
        hasScoreBreakdown: Bool
    ) -> Self {
        switch section {
        case .upcoming:
            return hasQualifyingRows ? .qualifying : .previousRace
        case .past:
            if hasResults { return .results }
            if hasQualifyingRows { return .qualifying }
            if hasScoreBreakdown { return .scoreSummary }
            return .unavailable
        }
    }
}

enum RaceContextResolver {
    static func previousCompletedRace(before race: Race, in races: [Race]) -> Race? {
        races
            .filter {
                $0.status == .completed
                    && $0.scheduledStartUtc < race.scheduledStartUtc
            }
            .max {
                if $0.scheduledStartUtc == $1.scheduledStartUtc {
                    return $0.id < $1.id
                }
                return $0.scheduledStartUtc < $1.scheduledStartUtc
            }
    }
}

struct RaceContextView: View {
    let section: RaceDeckSection
    let race: Race
    let detail: RaceDetailViewModel
    let previousRace: Race?
    let previousDetail: RaceDetailViewModel?

    private var kind: RaceContextKind {
        RaceContextKind.resolve(
            section: section,
            hasQualifyingRows: !detail.qualifyingResults.isEmpty,
            hasResults: !detail.results.isEmpty,
            hasScoreBreakdown: detail.serverPick?.scoreBreakdown != nil
        )
    }

    var body: some View {
        Group {
            if section == .past {
                pastContext
            } else {
                switch kind {
                case .previousRace:
                    PreviousRaceContextView(race: previousRace, detail: previousDetail)
                case .qualifying:
                    QualifyingResultsView(
                        race: race,
                        results: detail.qualifyingResults,
                        entrants: detail.entrants
                    )
                case .results:
                    RaceResultsView(
                        race: race,
                        results: detail.results,
                        entrants: detail.entrants,
                        pick: detail.serverPick
                    )
                case .scoreSummary:
                    CompactScoreContextView(race: race, pick: detail.serverPick)
                case .unavailable:
                    EmptyRaceContextView()
                }
            }
        }
        .accessibilityIdentifier("race-context-\(race.id)")
    }

    @ViewBuilder
    private var pastContext: some View {
        if !detail.results.isEmpty || !detail.qualifyingResults.isEmpty {
            VStack(spacing: 16) {
                if !detail.results.isEmpty {
                    RaceResultsView(
                        race: race,
                        results: detail.results,
                        entrants: detail.entrants,
                        pick: detail.serverPick
                    )
                }
                if !detail.qualifyingResults.isEmpty {
                    QualifyingResultsView(
                        race: race,
                        results: detail.qualifyingResults,
                        entrants: detail.entrants
                    )
                }
            }
        } else if detail.serverPick?.scoreBreakdown != nil {
            CompactScoreContextView(race: race, pick: detail.serverPick)
        } else {
            EmptyRaceContextView()
        }
    }
}

private struct PreviousRaceContextView: View {
    let race: Race?
    let detail: RaceDetailViewModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Last race")
                .font(.headline)

            if let race {
                HStack(spacing: 12) {
                    Text(race.flagEmoji)
                        .font(.title2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(race.name)
                            .font(.subheadline.weight(.semibold))
                        Text(race.circuitName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let score = detail?.serverPick?.scoreBreakdown?.totalScore {
                        Text("\(score) pts")
                            .font(.system(.headline, design: .monospaced).weight(.bold))
                            .foregroundStyle(FXTheme.Colors.gold)
                    }
                }

                if let detail, detail.serverPick != nil {
                    HStack(spacing: 8) {
                        contextPick("P1", detail.officialWinner)
                        contextPick("P10", detail.officialP10)
                        contextPick("DNF", detail.officialDNF)
                    }
                }
            } else {
                Text("Your previous race appears here once the season is underway.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fxCardSurface(radius: FXTheme.Radius.xl)
    }

    private func contextPick(_ slot: String, _ driver: Driver?) -> some View {
        HStack(spacing: 5) {
            Text(slot)
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .foregroundStyle(.secondary)
            Text(driver?.code ?? "—")
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(.quaternary.opacity(0.45), in: Capsule())
    }
}

private struct CompactScoreContextView: View {
    let race: Race
    let pick: Pick?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .font(.title2)
                .foregroundStyle(FXTheme.Colors.gold)
            VStack(alignment: .leading, spacing: 2) {
                Text("Scoring complete")
                    .font(.headline)
                Text("Your official points are shown on the \(race.name) card.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let score = pick?.scoreBreakdown?.totalScore {
                Text("\(score)")
                    .font(.system(.title2, design: .monospaced).weight(.black))
            }
        }
        .padding(18)
        .fxCardSurface(radius: FXTheme.Radius.xl)
    }
}

private struct EmptyRaceContextView: View {
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "clock")
                .foregroundStyle(.secondary)
            Text("Results are still being confirmed.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(18)
        .fxCardSurface(radius: FXTheme.Radius.xl)
    }
}
