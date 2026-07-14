import SwiftUI

struct RaceResultsView: View {
    let race: Race
    let results: [RaceResult]
    let entrants: [Driver]
    let pick: Pick?

    private var driverMap: [String: Driver] {
        Dictionary(uniqueKeysWithValues: entrants.map { ($0.id, $0) })
    }

    private var classified: [RaceResult] {
        results
            .filter { $0.status == .classified }
            .sorted { ($0.position ?? .max) < ($1.position ?? .max) }
    }

    private var retired: [RaceResult] {
        results
            .filter { $0.status != .classified }
            .sorted {
                if $0.position == $1.position { return $0.driverId < $1.driverId }
                return ($0.position ?? .max) < ($1.position ?? .max)
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(race.isSprint ? "Sprint results" : "Race results")
                    .font(.headline)
                Spacer()
                Text("POINTS GUIDE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            Divider().opacity(0.45)

            ForEach(classified, id: \.driverId) { result in
                if let driver = driverMap[result.driverId] {
                    resultRow(result, driver: driver)
                }
            }

            if !retired.isEmpty {
                HStack(spacing: 8) {
                    Rectangle().fill(.quaternary).frame(height: 1)
                    Text("DNF · DNS · DSQ")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(.tertiary)
                    Rectangle().fill(.quaternary).frame(height: 1)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 8)

                ForEach(retired, id: \.driverId) { result in
                    if let driver = driverMap[result.driverId] {
                        resultRow(result, driver: driver)
                    }
                }
            }
        }
        .fxCardSurface(radius: FXTheme.Radius.xl)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("race-results-\(race.id)")
    }

    private func resultRow(_ result: RaceResult, driver: Driver) -> some View {
        let isWinner = result.status == .classified && result.position == 1
        let isP10 = result.status == .classified && result.position == 10
        let isUserPick = pick.map {
            driver.id == $0.winnerDriverId
                || driver.id == $0.tenthPlaceDriverId
                || driver.id == $0.dnfDriverId
        } ?? false
        let score = potentialScore(for: result)

        return HStack(spacing: 10) {
            Text(score.points > 0 ? "+\(score.points)" : "—")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(
                    score.points > 0
                        ? score.color
                        : Color(uiColor: .tertiaryLabel)
                )
                .frame(width: 30, alignment: .trailing)

            Text(positionLabel(for: result))
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(isWinner ? FXTheme.Colors.accent : isP10 ? FXTheme.Colors.gold : .primary)
                .frame(width: 34, alignment: .trailing)

            Circle()
                .fill(driver.teamColor)
                .frame(width: 7, height: 7)

            VStack(alignment: .leading, spacing: 1) {
                Text(driver.code)
                    .font(.subheadline.weight(.semibold))
                Text("\(driver.firstName) \(driver.lastName)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                if isUserPick {
                    Text("Your pick")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(FXTheme.Colors.accent)
                        .accessibilityLabel("Your pick")
                        .accessibilityIdentifier("your-pick-\(race.id)-\(driver.id)")
                }
            }

            Spacer(minLength: 4)

            if result.fastestLap {
                Image(systemName: "bolt.fill")
                    .font(.caption)
                    .foregroundStyle(.purple)
                    .accessibilityLabel("Fastest lap")
            }

            if let label = slotLabel(for: result) {
                Text(label)
                    .font(.system(size: 9, weight: .black, design: .rounded))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(slotColor(label), in: Capsule())
                    .foregroundStyle(label == "P10" ? .black : .white)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 9)
        .background(
            isP10
                ? FXTheme.Colors.gold.opacity(0.08)
                : isUserPick ? FXTheme.Colors.accent.opacity(0.06) : Color.clear
        )
    }

    /// The API owns these hypothetical values. They are explanatory only and
    /// never used to decide whether the user's DNF pick was correct.
    private func potentialScore(for result: RaceResult) -> (points: Int, color: Color) {
        if result.status == .classified {
            if result.position == 1 {
                return (result.scoreGuide?.winner ?? 0, .green)
            }
            let score = result.scoreGuide?.p10 ?? 0
            return (score, result.position == 10 ? FXTheme.Colors.gold : .secondary)
        }
        return (result.scoreGuide?.dnf ?? 0, FXTheme.Colors.danger)
    }

    private func positionLabel(for result: RaceResult) -> String {
        if let position = result.position, result.status == .classified {
            return "P\(position)"
        }
        return result.status.rawValue
    }

    private func slotLabel(for result: RaceResult) -> String? {
        if result.status != .classified { return "DNF" }
        if result.position == 1 { return "P1" }
        if result.position == 10 { return "P10" }
        return nil
    }

    private func slotColor(_ label: String) -> Color {
        switch label {
        case "P10": FXTheme.Colors.gold
        case "DNF": FXTheme.Colors.danger
        default: FXTheme.Colors.accent
        }
    }
}
