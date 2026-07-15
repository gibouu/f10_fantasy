import Foundation
import SwiftUI

enum RaceContextKind: Equatable, Sendable {
    case seasonForm
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
            return hasQualifyingRows ? .qualifying : .seasonForm
        case .past:
            if hasResults { return .results }
            if hasQualifyingRows { return .qualifying }
            if hasScoreBreakdown { return .scoreSummary }
            return .unavailable
        }
    }
}

struct RaceContextView: View {
    let section: RaceDeckSection
    let race: Race
    let detail: RaceDetailViewModel

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
                case .seasonForm:
                    SeasonFormContextView(race: race, entrants: detail.entrants)
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

enum DriverSeasonForm {
    static func averageText(_ average: Double?) -> String {
        guard let average else { return "—" }
        return String(
            format: "%.1f",
            locale: Locale(identifier: "en_US_POSIX"),
            average
        )
    }

    static func dnfText(_ count: Int?) -> String {
        count.map(String.init) ?? "—"
    }
}

private struct SeasonFormContextView: View {
    let race: Race
    let entrants: [Driver]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Season form")
                    .font(.headline)
                    .accessibilityIdentifier("season-form-\(race.id)")
                Spacer()
                Text(race.isSprint ? "SPRINT" : "RACE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            Divider().opacity(0.45)

            HStack(spacing: 10) {
                Text("DRIVER")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("AVG")
                    .frame(width: 44, alignment: .trailing)
                Text("DNF")
                    .frame(width: 36, alignment: .trailing)
            }
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .tracking(0.8)
            .foregroundStyle(.tertiary)
            .padding(.horizontal, 18)
            .padding(.vertical, 8)

            ForEach(entrants) { driver in
                driverRow(driver)
            }
        }
        .fxCardSurface(radius: FXTheme.Radius.xl)
        .accessibilityElement(children: .contain)
    }

    private func driverRow(_ driver: Driver) -> some View {
        HStack(spacing: 10) {
            DriverBubbleView(driver: driver, size: 28)

            VStack(alignment: .leading, spacing: 1) {
                Text("\(driver.firstName) \(driver.lastName)")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(driver.constructor.shortName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(DriverSeasonForm.averageText(driver.seasonAverageFinish))
                .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                .frame(width: 44, alignment: .trailing)

            Text(DriverSeasonForm.dnfText(driver.seasonDnfCount))
                .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                .frame(width: 36, alignment: .trailing)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
        .background(Color.clear)
        .overlay(alignment: .bottom) {
            Divider()
                .opacity(0.3)
                .padding(.leading, 56)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(driver.firstName) \(driver.lastName), average finish "
                + "\(DriverSeasonForm.averageText(driver.seasonAverageFinish)), "
                + "DNF \(DriverSeasonForm.dnfText(driver.seasonDnfCount))"
        )
        .accessibilityIdentifier("season-form-row-\(driver.id)")
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
