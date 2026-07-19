import SwiftUI

struct RaceScheduleSheet: View {
    let race: Race

    private var rows: [RaceScheduleRow] {
        RaceScheduleRow.resolve(for: race)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FXTheme.Spacing.lg) {
                header
                schedule
            }
            .padding(.horizontal, 18)
            .padding(.top, FXTheme.Spacing.lg)
            .padding(.bottom, FXTheme.Spacing.xl)
            .frame(maxWidth: 430, alignment: .center)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(Color(uiColor: .systemBackground))
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Color(uiColor: .systemBackground))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("race-schedule-sheet")
    }

    private var header: some View {
        VStack(alignment: .center, spacing: FXTheme.Spacing.sm) {
            Text(race.flagEmoji)
                .font(.system(size: 38))
                .accessibilityHidden(true)

            Text("Schedule")
                .font(.largeTitle.weight(.bold))
                .frame(maxWidth: .infinity, alignment: .center)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("schedule-sheet-title")

            Text("\(race.name)  ·  \(race.roundLabel)")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var schedule: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                scheduleRow(row)

                if index < rows.count - 1 {
                    Divider()
                        .padding(.leading, 58)
                }
            }
        }
        .background(
            Color(uiColor: .secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous)
                .stroke(.primary.opacity(0.09), lineWidth: 0.5)
        }
    }

    private func scheduleRow(_ row: RaceScheduleRow) -> some View {
        HStack(spacing: 14) {
            Image(systemName: row.systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(row.kind == .bonusCutoff ? FXTheme.Colors.gold : .primary)
                .frame(width: 36, height: 36)
                .background(Color(uiColor: .tertiarySystemBackground), in: Circle())
                .accessibilityHidden(true)

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: FXTheme.Spacing.md) {
                    Text(row.title)
                        .font(.body.weight(.semibold))

                    Spacer(minLength: FXTheme.Spacing.sm)

                    dateText(row.date)
                        .multilineTextAlignment(.trailing)
                }

                VStack(alignment: .leading, spacing: FXTheme.Spacing.xs) {
                    Text(row.title)
                        .font(.body.weight(.semibold))
                    dateText(row.date)
                }
            }
        }
        .frame(minHeight: 68)
        .padding(.horizontal, FXTheme.Spacing.md)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(row.title)
        .accessibilityValue(row.date.formatted(date: .abbreviated, time: .shortened))
        .accessibilityIdentifier(row.accessibilityIdentifier)
    }

    private func dateText(_ date: Date) -> some View {
        Text(
            date,
            format: .dateTime
                .weekday(.abbreviated)
                .month(.abbreviated)
                .day()
                .hour()
                .minute()
        )
        .font(.subheadline.monospacedDigit())
        .foregroundStyle(.secondary)
    }
}
