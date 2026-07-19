import SwiftUI

struct RacePickPanel: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @Bindable var viewModel: RaceDetailViewModel
    let now: Date
    let onSelectSlot: (PickSlot) -> Void
    let onRetryCommit: () -> PickSelectionOutcome
    let onSignIn: () -> Void
    let onResolveConflict: () -> Void
    let isAuthenticated: Bool

    private var isLocked: Bool {
        now >= viewModel.race.lockCutoffUtc || viewModel.serverPick?.lockedAt != nil
    }

    private var isDriverSelectionReady: Bool {
        !viewModel.entrants.isEmpty
    }

    private var selectionCount: Int {
        [
            viewModel.selectedWinnerID,
            viewModel.selectedP10ID,
            viewModel.selectedDNFID,
        ].compactMap { $0 }.count
    }

    var body: some View {
        VStack(spacing: pickRowSpacing) {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Your picks")
                        .font(.headline)
                    accessibilityProgress
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 2)
            } else {
                HStack {
                    Text("Your picks")
                        .font(.headline)
                    Spacer()
                    progress
                }
                .padding(.bottom, 8)
            }

            pickRow(.winner, presentation: viewModel.selectedPickPresentation(for: .winner))
            Divider().padding(.leading, dynamicTypeSize.isAccessibilitySize ? 0 : 52)
            pickRow(.p10, presentation: viewModel.selectedPickPresentation(for: .p10))
            Divider().padding(.leading, dynamicTypeSize.isAccessibilitySize ? 0 : 52)
            pickRow(.dnf, presentation: viewModel.selectedPickPresentation(for: .dnf))

            RacePickStatusRail(status: pickStatus, onAction: handleStatusAction)
                .padding(.top, dynamicTypeSize.isAccessibilitySize ? 8 : 12)
        }
    }

    private var pickRowSpacing: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? 10 : 0
    }

    private var accessibilityProgress: some View {
        HStack(spacing: 8) {
            progressDots
            Text("\(selectionCount)/3 picks selected")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(selectionCount) of 3 picks selected")
    }

    private var progress: some View {
        HStack(spacing: 6) {
            progressDots
            Text("\(selectionCount)/3")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(selectionCount) of 3 picks selected")
    }

    private var progressDots: some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(index < selectionCount ? FXTheme.Colors.accent : Color.secondary.opacity(0.22))
                    .frame(width: 6, height: 6)
            }
        }
    }

    private var pickStatus: RacePickStatus {
        let lookupIssue: RacePickSyncIssue? = switch viewModel.privatePickAuthority {
        case .unauthorized: .unauthorized
        case .unavailable: .offline
        case .notRequired, .checking, .missing, .found: nil
        }
        return RacePickStatusResolver.resolve(
            RacePickStatusContext(
                selectionCount: selectionCount,
                submissionState: viewModel.submissionState,
                isAuthenticated: isAuthenticated,
                syncIssue: viewModel.syncIssue ?? lookupIssue,
                didLocalWriteFail: viewModel.didLocalWriteFail,
                isLocked: isLocked,
                localRevision: viewModel.currentLocalPickRevision,
                acknowledgedRevision: viewModel.acknowledgedLocalPickRevision,
                currentRevisionRejected: viewModel.currentRevisionRejected,
                bonusAuthority: viewModel.pickBonusAuthority,
                qualifyingStartUtc: viewModel.race.qualifyingStartUtc,
                now: now
            )
        )
    }

    private func handleStatusAction(_ action: RacePickStatusAction) {
        switch action {
        case .none:
            break
        case .retry:
            PickCommitFeedback.publish(for: .selection(onRetryCommit()))
        case .signIn:
            onSignIn()
        case .resolveConflict:
            onResolveConflict()
        }
    }

    private func pickRow(_ slot: PickSlot, presentation: PickSlotPresentation) -> some View {
        Button {
            guard !isLocked else {
                Haptics.locked()
                return
            }
            guard isDriverSelectionReady else { return }
            Haptics.pick()
            onSelectSlot(slot)
        } label: {
            if dynamicTypeSize.isAccessibilitySize {
                accessibilityPickRow(slot, presentation: presentation)
            } else {
                normalPickRow(slot, presentation: presentation)
            }
        }
        .buttonStyle(.plain)
        .disabled(isLocked || !isDriverSelectionReady)
        .accessibilityIdentifier("pick-slot-\(viewModel.race.id)-\(slot.rawValue)")
        .accessibilityHint(pickRowAccessibilityHint)
    }

    private func normalPickRow(
        _ slot: PickSlot,
        presentation: PickSlotPresentation
    ) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                slotLabel(slot, fixedWidth: true)
                DriverBubbleView(driver: presentation.driver, size: 36)
                driverIdentity(presentation, allowsWrapping: false)
                Spacer(minLength: 0)
                trailingIcon
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    slotLabel(slot, fixedWidth: false)
                    Spacer()
                    trailingIcon
                }
                HStack(alignment: .top, spacing: 12) {
                    DriverBubbleView(driver: presentation.driver, size: 36)
                    driverIdentity(presentation, allowsWrapping: true)
                    Spacer(minLength: 0)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: 54)
        .contentShape(Rectangle())
    }

    private func accessibilityPickRow(
        _ slot: PickSlot,
        presentation: PickSlotPresentation
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                slotLabel(slot, fixedWidth: false)
                Spacer()
                trailingIcon
            }
            HStack(alignment: .top, spacing: 12) {
                DriverBubbleView(driver: presentation.driver, size: 36)
                driverIdentity(presentation, allowsWrapping: true)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: 104)
        .contentShape(Rectangle())
    }

    private func slotLabel(_ slot: PickSlot, fixedWidth: Bool) -> some View {
        Text(slot.label)
            .font(.system(size: 11, weight: .black, design: .monospaced))
            .foregroundStyle(slotColor(slot))
            .frame(width: fixedWidth ? 36 : nil, alignment: .leading)
    }

    private func driverIdentity(
        _ presentation: PickSlotPresentation,
        allowsWrapping: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(presentation.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(presentation.isOccupied ? .primary : .secondary)
                .lineLimit(allowsWrapping ? 3 : 1)
            if let detail = presentation.detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(allowsWrapping ? 2 : 1)
            }
        }
    }

    @ViewBuilder
    private var trailingIcon: some View {
        if isLocked {
            Image(systemName: "lock.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        } else if !isDriverSelectionReady {
            ProgressView()
                .controlSize(.small)
                .accessibilityLabel("Drivers are loading")
        } else {
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
    }

    private var pickRowAccessibilityHint: String {
        if isLocked { return "Picks are locked" }
        if !isDriverSelectionReady { return "Drivers are loading" }
        return "Opens the driver picker"
    }

    private func slotColor(_ slot: PickSlot) -> Color {
        switch slot {
        case .winner: FXTheme.Colors.accent
        case .p10: FXTheme.Colors.gold
        case .dnf: FXTheme.Colors.danger
        }
    }
}

struct RacePickPanelPlaceholder: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(spacing: dynamicTypeSize.isAccessibilitySize ? 10 : 0) {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Your picks").font(.headline)
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Picks are loading")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 2)
            } else {
                HStack {
                    Text("Your picks").font(.headline)
                    Spacer()
                    ProgressView().controlSize(.small)
                }
                .padding(.bottom, 8)
            }

            ForEach(Array(PickSlot.allCases.enumerated()), id: \.element.id) { index, slot in
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(slot.label)
                            .font(.system(size: 11, weight: .black, design: .monospaced))
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color.secondary.opacity(0.12))
                                .frame(width: 36, height: 36)
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.secondary.opacity(0.12))
                                .frame(width: 176, height: 18)
                            Spacer()
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
                } else {
                    HStack(spacing: 12) {
                        Text(slot.label)
                            .font(.system(size: 11, weight: .black, design: .monospaced))
                            .frame(width: 36, alignment: .leading)
                        Circle()
                            .fill(Color.secondary.opacity(0.12))
                            .frame(width: 36, height: 36)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.secondary.opacity(0.12))
                            .frame(width: 126, height: 13)
                        Spacer()
                    }
                    .frame(minHeight: 54)
                }

                if index < 2 {
                    Divider().padding(.leading, dynamicTypeSize.isAccessibilitySize ? 0 : 52)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.secondary.opacity(0.12))
                    .frame(width: 118, height: 10)
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.secondary.opacity(0.12))
                    .frame(width: 184, height: 8)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.top, 12)
        }
        .redacted(reason: .placeholder)
        .accessibilityLabel("Loading picks")
    }
}
