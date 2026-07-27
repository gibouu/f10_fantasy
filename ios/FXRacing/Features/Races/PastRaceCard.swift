import SwiftUI

struct PastRaceCard: View {
    let race: Race
    let detail: RaceDetailViewModel?
    let isSelected: Bool
    let onSchedule: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            Divider().opacity(0.4)

            if let detail {
                officialScore(detail)
                scoredPickRows(detail)
                deviceDraft(detail)
            } else {
                loadingScore
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 344, alignment: .topLeading)
        .background(
            LinearGradient(
                colors: [FXTheme.Colors.surfaceElevated, FXTheme.Colors.surfaceElevated],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous)
                .strokeBorder(FXTheme.Colors.cardBorder(isSelected: isSelected), lineWidth: 1)
        }
        .shadow(color: .black.opacity(isSelected ? 0.16 : 0.08), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("race-card-\(race.id)")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(race.flagEmoji)
                .font(.system(size: 32))
            VStack(alignment: .leading, spacing: 3) {
                Text(race.roundLabel)
                    .font(.system(size: 10, weight: .black, design: .monospaced))
                    .foregroundStyle(.secondary)
                Text(race.name)
                    .font(.title3.weight(.bold))
                    .tracking(-0.3)
                    .lineLimit(2)
                Text(race.scheduledStartUtc.formatted(.dateTime.month(.abbreviated).day().year()))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
            Button(action: onSchedule) {
                Image(systemName: "calendar")
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Schedule")
            .accessibilityIdentifier("schedule-\(race.id)")
        }
    }

    private func officialScore(_ detail: RaceDetailViewModel) -> some View {
        let score = detail.serverPick?.scoreBreakdown?.totalScore

        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(score.map(String.init) ?? "—")
                .font(.system(size: 44, weight: .black, design: .monospaced))
                .foregroundStyle(score == nil ? Color.secondary : FXTheme.Colors.gold)
                .contentTransition(.numericText())
            Text("PTS")
                .font(.system(size: 11, weight: .black, design: .monospaced))
                .tracking(1)
                .foregroundStyle(.secondary)
            Spacer()
            if let bonus = detail.serverPick?.scoreBreakdown?.earlyBirdBonus,
               bonus > 0 {
                Label("2× +\(bonus)", systemImage: "bolt.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.green)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("race-total-\(race.id)")
    }

    private func scoredPickRows(_ detail: RaceDetailViewModel) -> some View {
        let breakdown = detail.serverPick?.scoreBreakdown

        return VStack(spacing: 0) {
            scoreRow("P1", presentation: detail.officialPickPresentation(for: .winner), points: breakdown?.winnerBonus)
            Divider().padding(.leading, 40)
            scoreRow("P10", presentation: detail.officialPickPresentation(for: .p10), points: breakdown?.tenthPlaceScore)
            Divider().padding(.leading, 40)
            scoreRow("DNF", presentation: detail.officialPickPresentation(for: .dnf), points: breakdown?.dnfBonus)
        }
    }

    private func scoreRow(_ slot: String, presentation: PickSlotPresentation, points: Int?) -> some View {
        let driver = presentation.driver

        return HStack(spacing: 10) {
            Text(slot)
                .font(.system(size: 10, weight: .black, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 32, alignment: .leading)
            DriverBubbleView(driver: driver, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(presentation.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(presentation.isOccupied ? .primary : .secondary)
                    .lineLimit(2)
                if let detail = presentation.detail, driver == nil, presentation.isOccupied {
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            Text(points.map { "+\($0)" } ?? "—")
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundStyle((points ?? 0) > 0 ? FXTheme.Colors.gold : .secondary)
        }
        .frame(minHeight: 48)
    }

    @ViewBuilder
    private func deviceDraft(_ detail: RaceDetailViewModel) -> some View {
        if detail.unsubmittedDeviceDraft != nil {
            Divider().opacity(0.4)

            VStack(alignment: .leading, spacing: 10) {
                Label("Device draft — not submitted", systemImage: "iphone.badge.exclamationmark")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.orange)

                Text("Saved only on this device. It is not included in the official score above.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                draftRow("P1", presentation: detail.selectedPickPresentation(for: .winner))
                draftRow("P10", presentation: detail.selectedPickPresentation(for: .p10))
                draftRow("DNF", presentation: detail.selectedPickPresentation(for: .dnf))
            }
            .padding(12)
            .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("device-draft-\(race.id)")
        }
    }

    private func draftRow(_ slot: String, presentation: PickSlotPresentation) -> some View {
        let driver = presentation.driver

        return HStack(spacing: 10) {
            Text(slot)
                .font(.system(size: 10, weight: .black, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 32, alignment: .leading)
            DriverBubbleView(driver: driver, size: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(presentation.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(presentation.isOccupied ? .primary : .secondary)
                    .lineLimit(2)
                if let detail = presentation.detail, driver == nil, presentation.isOccupied {
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 4)
        }
        .frame(minHeight: 34)
    }

    private var loadingScore: some View {
        VStack(alignment: .leading, spacing: 14) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.secondary.opacity(0.12))
                .frame(width: 112, height: 44)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.secondary.opacity(0.12))
                    .frame(height: 38)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityLabel("Loading race score")
    }
}
