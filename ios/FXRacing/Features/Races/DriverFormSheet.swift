import SwiftUI

struct DriverFormSheet: View {
    let race: Race
    let driver: Driver

    private var history: [DriverSeasonResult] {
        driver.seasonResults ?? []
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FXTheme.Spacing.lg) {
                header

                Text(Self.contextLabel(for: race))
                    .font(.headline)

                if history.isEmpty {
                    Text(Self.emptyHistoryText(for: race))
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                } else {
                    historyList
                }

                Text("AVG uses classified finishes.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 18)
            .padding(.top, FXTheme.Spacing.lg)
            .padding(.bottom, FXTheme.Spacing.xl)
        }
        .background(Color(uiColor: .systemBackground).ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Color(.systemBackground))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("driver-form-sheet-\(driver.id)")
    }

    static func contextLabel(for race: Race) -> String {
        race.isSprint
            ? "Sprint results before \(race.country)"
            : "Race results before \(race.country)"
    }

    static func emptyHistoryText(for race: Race) -> String {
        race.isSprint ? "No completed sprints yet." : "No completed races yet."
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: FXTheme.Spacing.sm) {
            Text("\(driver.firstName) \(driver.lastName)")
                .font(.largeTitle.weight(.bold))
                .accessibilityAddTraits(.isHeader)

            Text(driver.constructor.name)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)

            HStack(spacing: FXTheme.Spacing.md) {
                summaryStat(
                    label: "AVG",
                    value: DriverSeasonForm.averageText(driver.seasonAverageFinish)
                )
                summaryStat(
                    label: "OUT",
                    value: DriverSeasonForm.outText(driver.seasonDnfCount),
                    accessibilityLabel: "non-classified results"
                )
            }
        }
    }

    private func summaryStat(
        label: String,
        value: String,
        accessibilityLabel: String? = nil
    ) -> some View {
        HStack(spacing: FXTheme.Spacing.xs) {
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body.weight(.semibold))
                .monospacedDigit()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel ?? label)
        .accessibilityValue(value)
    }

    private var historyList: some View {
        VStack(spacing: 0) {
            ForEach(Array(history.enumerated()), id: \.element.id) { index, result in
                historyRow(result)

                if index < history.count - 1 {
                    Divider()
                }
            }
        }
        .background(FXTheme.Colors.surface, in: RoundedRectangle(
            cornerRadius: FXTheme.Radius.lg,
            style: .continuous
        ))
    }

    private func historyRow(_ result: DriverSeasonResult) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: FXTheme.Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(result.raceName)
                    .font(.body.weight(.medium))
                Text(result.scheduledStartUtc, format: .dateTime.month(.abbreviated).day())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: FXTheme.Spacing.sm)

            Text(result.resultLabel)
                .font(.body.weight(.bold))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .padding(.horizontal, FXTheme.Spacing.md)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(result.raceName)
        .accessibilityValue(result.resultLabel)
        .accessibilityIdentifier("driver-form-result-\(result.raceId)")
    }
}
