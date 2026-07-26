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

    static func outText(_ count: Int?) -> String {
        count.map(String.init) ?? "—"
    }
}

private struct SeasonFormContextView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var selectedDriver: Driver?

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
                    .font(.caption.weight(.bold))
                    .monospaced()
                    .tracking(1.2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            Divider().opacity(0.45)

            HStack(alignment: .firstTextBaseline, spacing: 16) {
                Text("DRIVER")
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 16) {
                    Text("AVG")
                    Text("OUT")
                }
            }
            .font(.caption.weight(.bold))
            .monospaced()
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
        .sheet(item: $selectedDriver) { driver in
            DriverFormSheet(race: race, driver: driver)
        }
    }

    private func driverRow(_ driver: Driver) -> some View {
        Button {
            selectedDriver = driver
        } label: {
            ViewThatFits(in: .horizontal) {
                if dynamicTypeSize.isAccessibilitySize {
                    wrappedRow(driver)
                } else {
                    horizontalRow(driver)
                }
                wrappedRow(driver)
            }
            .contentShape(Rectangle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "\(driver.firstName) \(driver.lastName), average finish "
                    + "\(DriverSeasonForm.averageText(driver.seasonAverageFinish)), "
                    + "non-classified results \(DriverSeasonForm.outText(driver.seasonDnfCount))"
            )
            .accessibilityIdentifier("season-form-row-\(driver.id)")
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) {
            Divider()
                .opacity(0.3)
        }
    }

    private func horizontalRow(_ driver: Driver) -> some View {
        HStack(spacing: 12) {
            driverIdentity(driver, allowsWrapping: false)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 16) {
                stat("AVG", value: DriverSeasonForm.averageText(driver.seasonAverageFinish))
                stat("OUT", value: DriverSeasonForm.outText(driver.seasonDnfCount))
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
    }

    private func wrappedRow(_ driver: Driver) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                driverIdentity(driver, allowsWrapping: true)
                HStack(spacing: 20) {
                    stat("AVG", value: DriverSeasonForm.averageText(driver.seasonAverageFinish))
                    stat("OUT", value: DriverSeasonForm.outText(driver.seasonDnfCount))
                }
                .padding(.leading, 20)
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
    }

    private func driverIdentity(
        _ driver: Driver,
        allowsWrapping: Bool
    ) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Circle()
                .fill(driver.teamColor)
                .frame(width: 10, height: 10)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text("\(driver.firstName) \(driver.lastName)")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(allowsWrapping ? nil : 1)
                Text(driver.constructor.shortName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func stat(_ label: String, value: String) -> some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
        }
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
