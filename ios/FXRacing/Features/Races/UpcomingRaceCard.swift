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
        .frame(maxWidth: .infinity, minHeight: cardHeight, maxHeight: cardHeight, alignment: .topLeading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: FXTheme.Radius.xl, style: .continuous)
                .strokeBorder(.white.opacity(isSelected ? 0.14 : 0.07), lineWidth: 1)
        }
        .shadow(color: .black.opacity(isSelected ? 0.16 : 0.08), radius: 18, y: 8)
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

    private func header(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
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

                Spacer()

                Button(action: onSchedule) {
                    Label("Schedule", systemImage: "calendar")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 11)
                        .frame(minWidth: 44, minHeight: 44)
                        .background(.thinMaterial, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("schedule-\(race.id)")
            }

            HStack(alignment: .top, spacing: 12) {
                Text(race.flagEmoji)
                    .font(.system(size: 32))

                VStack(alignment: .leading, spacing: 3) {
                    Text(race.name)
                        .font(.title3.weight(.bold))
                        .tracking(-0.3)
                        .lineLimit(2)
                    Text(race.circuitName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Text(countdownLine(now: now))
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundStyle(
                            race.status == .live
                                ? FXTheme.Colors.accent
                                : Color.primary
                        )
                        .contentTransition(.numericText())
                    Text(dateLine)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Spacer(minLength: 0)
            }
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

    private var cardBackground: some ShapeStyle {
        LinearGradient(
            colors: [
                FXTheme.Colors.surfaceElevated,
                FXTheme.Colors.surface,
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
