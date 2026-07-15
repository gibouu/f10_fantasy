import SwiftUI

struct QualifyingResultsView: View {
    let race: Race
    let results: [QualifyingResultRow]
    let entrants: [Driver]

    private var driverMap: [String: Driver] {
        Dictionary(uniqueKeysWithValues: entrants.map { ($0.id, $0) })
    }

    private var sortedResults: [QualifyingResultRow] {
        results.sorted { $0.position < $1.position }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(race.isSprint ? "Sprint qualifying" : "Qualifying")
                    .font(.headline)
                Spacer()
                Text("GRID")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            Divider().opacity(0.45)

            ForEach(sortedResults, id: \.driverId) { result in
                row(result, driver: driverMap[result.driverId])
            }
        }
        .fxCardSurface(radius: FXTheme.Radius.xl)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("qualifying-results-\(race.id)")
    }

    private func row(_ result: QualifyingResultRow, driver: Driver?) -> some View {
        let isPole = result.position == 1

        return HStack(spacing: 11) {
            Text("P\(result.position)")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(isPole ? FXTheme.Colors.gold : .secondary)
                .frame(width: 34, alignment: .leading)

            DriverBubbleView(driver: driver, size: 30)

            VStack(alignment: .leading, spacing: 1) {
                Text(driver?.code ?? "—")
                    .font(.subheadline.weight(.semibold))
                if let driver {
                    Text("\(driver.firstName) \(driver.lastName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 0)

            if isPole {
                Image(systemName: "medal.fill")
                    .foregroundStyle(FXTheme.Colors.gold)
                    .accessibilityLabel("Pole position")
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 9)
        .background(isPole ? FXTheme.Colors.gold.opacity(0.08) : Color.clear)
    }
}
