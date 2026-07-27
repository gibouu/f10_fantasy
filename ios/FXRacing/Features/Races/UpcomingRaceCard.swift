import SwiftUI

struct UpcomingRaceCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let race: Race
    let detail: RaceDetailViewModel?
    let isSelected: Bool
    let isAuthenticated: Bool
    let onSchedule: () -> Void
    let onSelectSlot: (PickSlot) -> Void
    let onRetryCommit: () -> PickSelectionOutcome
    let onSignIn: () -> Void
    let onResolveConflict: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            card(now: context.date)
        }
    }

    private func card(now: Date) -> some View {
        let contentState = detail.map(cardContentState) ?? .placeholder
        let cardHeight = UpcomingCardLayoutMetrics.cardHeight(
            for: dynamicTypeSize,
            contentState: contentState
        )

        return VStack(alignment: .leading, spacing: 16) {
            header(now: now)

            Divider().opacity(0.4)

            if let detail {
                RacePickPanel(
                    viewModel: detail,
                    now: now,
                    onSelectSlot: onSelectSlot,
                    onRetryCommit: onRetryCommit,
                    onSignIn: onSignIn,
                    onResolveConflict: onResolveConflict,
                    isAuthenticated: isAuthenticated
                )
            } else {
                RacePickPanelPlaceholder()
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: cardHeight, alignment: .topLeading)
        .frame(
            maxHeight: dynamicTypeSize.isAccessibilitySize ? nil : cardHeight,
            alignment: .topLeading
        )
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous))
        // No drop shadow: the card sits inside `CenteredRacePager`'s horizontal
        // ScrollView, which clips its content, so a shadow gets sliced off flat
        // at the viewport edge instead of fading. The border above carries both
        // the separation and the selected/unselected distinction.
        .overlay {
            RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous)
                .strokeBorder(FXTheme.Colors.cardBorder(isSelected: isSelected), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("race-card-\(race.id)")
    }

    private func cardContentState(for detail: RaceDetailViewModel) -> UpcomingCardContentState {
        return switch detail.submissionState {
        case .savingLocally, .syncing:
            .saving
        case .reviewRequired, .missingFromAccount, .conflict:
            .conflict
        case .idle, .savedOnDevice, .savedToAccount, .expired:
            detail.hasRecoverableDevicePick ? .recoveryAvailable : .hydrated
        }
    }

    @ViewBuilder
    private func header(now: Date) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            accessibilityHeader(now: now)
        } else {
            normalHeader(now: now)
        }
    }

    private func normalHeader(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                raceStateLine
                Spacer()
                scheduleButton
            }

            raceIdentity(now: now, isAccessibilityLayout: false)
        }
    }

    private func accessibilityHeader(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            raceStateLine
            accessibilityScheduleButton
            raceIdentity(now: now, isAccessibilityLayout: true)
        }
    }

    private var raceStateLine: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(race.roundLabel)
                .font(.system(size: 11, weight: .black, design: .monospaced))
                .foregroundStyle(.secondary)

            if race.status == .live {
                Text("LIVE")
                    .font(.system(size: 9, weight: .black, design: .monospaced))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(FXTheme.Colors.accent, in: Capsule())
                    .foregroundStyle(.white)
            } else if race.isSprint {
                Text("SPRINT")
                    .font(.system(size: 9, weight: .black, design: .monospaced))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(FXTheme.Colors.gold.opacity(0.18), in: Capsule())
                    .foregroundStyle(FXTheme.Colors.gold)
            }
        }
    }

    private var scheduleButton: some View {
        Button(action: onSchedule) {
            Label("Schedule", systemImage: "calendar")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 11)
                .frame(minWidth: 44, minHeight: 44)
                .background(.thinMaterial, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Schedule")
        .accessibilityIdentifier("schedule-\(race.id)")
    }

    private var accessibilityScheduleButton: some View {
        Button(action: onSchedule) {
            Label("Schedule", systemImage: "calendar")
                .font(.headline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(1)
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .background(.thinMaterial, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Schedule")
        .accessibilityIdentifier("schedule-\(race.id)")
    }

    private func raceIdentity(
        now: Date,
        isAccessibilityLayout: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(race.flagEmoji)
                .font(.system(size: isAccessibilityLayout ? 28 : 32))

            VStack(alignment: .leading, spacing: isAccessibilityLayout ? 8 : 3) {
                Text(race.name)
                    .font(.title3.weight(.bold))
                    .tracking(-0.3)
                    .lineLimit(isAccessibilityLayout ? 3 : 2)
                Text(race.circuitName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(isAccessibilityLayout ? 3 : 2)
                Text(countdownLine(now: now))
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(
                        race.status == .live
                            ? FXTheme.Colors.accent
                            : Color.primary
                    )
                    .contentTransition(.numericText())
                    .lineLimit(1)
                    .minimumScaleFactor(1)
                Text(dateLine)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(isAccessibilityLayout ? 2 : 1)
            }

            Spacer(minLength: 0)
        }
    }

    private var dateLine: String {
        race.scheduledStartUtc.formatted(
            .dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()
        )
    }

    private func countdownLine(now: Date) -> String {
        let interval = race.scheduledStartUtc.timeIntervalSince(now)
        if race.status == .live || interval <= 0 { return "Live now" }
        if interval < 60 { return "Starts now" }
        if interval < 3_600 { return "Starts in \(Int(interval / 60))m" }

        let hours = Int(interval / 3_600)
        if hours < 24 { return "Starts in \(hours)h \(Int(interval / 60) % 60)m" }
        return "Starts in \(hours / 24)d \(hours % 24)h"
    }

    /// Flat elevated surface rather than a gradient. In light mode the old
    /// gradient ran pure white -> 0.97 against a white page, so its darker end
    /// was the only visible boundary and read as a stray line. Separation now
    /// comes from the page being a grouped background, plus a real border.
    private var cardBackground: some ShapeStyle {
        FXTheme.Colors.surfaceElevated
    }
}
