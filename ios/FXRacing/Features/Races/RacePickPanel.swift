import SwiftUI

struct RacePickPanel: View {
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
        VStack(spacing: 0) {
            HStack {
                Text("Your picks")
                    .font(.headline)
                Spacer()
                progress
            }
            .padding(.bottom, 8)

            pickRow(.winner, driver: viewModel.selectedWinner)
            Divider().padding(.leading, 52)
            pickRow(.p10, driver: viewModel.selectedP10)
            Divider().padding(.leading, 52)
            pickRow(.dnf, driver: viewModel.selectedDNF)

            RacePickStatusRail(status: pickStatus, onAction: handleStatusAction)
                .padding(.top, 12)
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

    private var progress: some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(index < selectionCount ? FXTheme.Colors.accent : Color.secondary.opacity(0.22))
                    .frame(width: 6, height: 6)
            }
            Text("\(selectionCount)/3")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(selectionCount) of 3 picks selected")
    }

    private func pickRow(_ slot: PickSlot, driver: Driver?) -> some View {
        Button {
            guard !isLocked else {
                Haptics.locked()
                return
            }
            guard isDriverSelectionReady else { return }
            Haptics.pick()
            onSelectSlot(slot)
        } label: {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    slotLabel(slot, fixedWidth: true)
                    DriverBubbleView(driver: driver, size: 36)
                    driverIdentity(slot, driver: driver, allowsWrapping: false)
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
                        DriverBubbleView(driver: driver, size: 36)
                        driverIdentity(slot, driver: driver, allowsWrapping: true)
                        Spacer(minLength: 0)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isLocked || !isDriverSelectionReady)
        .accessibilityIdentifier("pick-slot-\(viewModel.race.id)-\(slot.rawValue)")
        .accessibilityHint(pickRowAccessibilityHint)
    }

    private func slotLabel(_ slot: PickSlot, fixedWidth: Bool) -> some View {
        Text(slot.label)
            .font(.system(size: 11, weight: .black, design: .monospaced))
            .foregroundStyle(slotColor(slot))
            .frame(width: fixedWidth ? 36 : nil, alignment: .leading)
    }

    private func driverIdentity(
        _ slot: PickSlot,
        driver: Driver?,
        allowsWrapping: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(driver.map { "\($0.firstName) \($0.lastName)" } ?? slot.sheetTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(driver == nil ? .secondary : .primary)
                .lineLimit(allowsWrapping ? 3 : 1)
            Text(driver?.constructor.shortName ?? slotDescription(slot))
                .font(.caption)
                .foregroundStyle(.tertiary)
                .lineLimit(allowsWrapping ? 2 : 1)
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

    private func slotDescription(_ slot: PickSlot) -> String {
        switch slot {
        case .winner: "Race winner"
        case .p10: "Finishes tenth"
        case .dnf: "First retirement"
        }
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
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Your picks").font(.headline)
                Spacer()
                ProgressView().controlSize(.small)
            }
            .padding(.bottom, 8)

            ForEach(Array(PickSlot.allCases.enumerated()), id: \.element.id) { index, slot in
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

                if index < 2 { Divider().padding(.leading, 52) }
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
