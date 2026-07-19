import SwiftUI

enum LegacyRecoveryAccountContext: Equatable, Sendable {
    case guest
    case signedIn(userID: String?)
    case unavailable

    static func resolve(authState: AuthManager.State) -> Self {
        switch authState {
        case .unauthenticated:
            return .guest
        case .authenticated(let user):
            return .signedIn(userID: user.id)
        case .unknown, .accountUnavailable:
            return .unavailable
        }
    }

    var isSignedIn: Bool {
        if case .guest = self { return false }
        return true
    }

    var requiresConnection: Bool {
        if case .unavailable = self { return true }
        return false
    }

    var userID: String? {
        if case .signedIn(let userID) = self { return userID }
        return nil
    }
}

enum LegacyRecoverySheetMode: Equatable, Sendable {
    case guest
    case checking
    case unavailable
    case emptyAccount
    case conflict

    static func resolve(
        isSignedIn: Bool,
        authority: PrivatePickAuthority,
        hasDestination: Bool
    ) -> LegacyRecoverySheetMode {
        guard isSignedIn else { return .guest }
        switch authority {
        case .checking, .notRequired:
            return .checking
        case .unavailable, .unauthorized:
            return .unavailable
        case .missing:
            return hasDestination ? .conflict : .emptyAccount
        case .found:
            return .conflict
        }
    }
}

enum LegacyRecoverySheetAction: Equatable, Sendable {
    case use
    case discard
    case keepCurrent
    case replace
    case retry
    case notNow
}

struct LegacyRecoverySheetActionMatrix: Equatable, Sendable {
    let actions: [LegacyRecoverySheetAction]
    private let disabledActions: Set<LegacyRecoverySheetAction>

    static func resolve(
        mode: LegacyRecoverySheetMode,
        isLocked: Bool
    ) -> Self {
        switch mode {
        case .guest:
            return Self(
                actions: [.use, .discard, .notNow],
                disabledActions: isLocked ? [.use] : []
            )
        case .checking, .unavailable:
            return Self(actions: [.retry, .notNow], disabledActions: [])
        case .emptyAccount:
            return Self(
                actions: [.use, .discard, .notNow],
                disabledActions: isLocked ? [.use] : []
            )
        case .conflict:
            return Self(
                actions: [.keepCurrent, .replace, .discard, .notNow],
                disabledActions: isLocked ? [.replace] : []
            )
        }
    }

    func isEnabled(_ action: LegacyRecoverySheetAction) -> Bool {
        !disabledActions.contains(action)
    }

    func requiresConfirmation(_ action: LegacyRecoverySheetAction) -> Bool {
        action == .replace
    }
}

struct LegacyPickTriplet: Equatable, Sendable {
    let winner: String
    let tenthPlace: String
    let dnf: String
}

struct LegacyRecoveryPresentation: Identifiable, Equatable, Sendable {
    let raceID: String
    let privateScopeID: String
    let userID: String?
    let isSignedIn: Bool
    let requiresConnection: Bool
    let legacyRevision: UInt64
    let destinationRevision: UInt64?
    let serverPick: LegacyPrivatePickSnapshot?
    let found: LegacyPickTriplet
    let current: LegacyPickTriplet?

    var id: String { "\(privateScopeID):\(raceID):\(legacyRevision)" }

    var mutationOwner: PickOwnerScope? {
        if requiresConnection { return nil }
        if isSignedIn {
            return userID.map(PickOwnerScope.user)
        }
        return .guest
    }

    func refreshed(
        userID: String? = nil,
        isSignedIn: Bool? = nil,
        requiresConnection: Bool? = nil,
        destinationRevision: UInt64?,
        serverPick: LegacyPrivatePickSnapshot?,
        found: LegacyPickTriplet? = nil,
        current: LegacyPickTriplet?
    ) -> Self {
        Self(
            raceID: raceID,
            privateScopeID: privateScopeID,
            userID: userID ?? self.userID,
            isSignedIn: isSignedIn ?? self.isSignedIn,
            requiresConnection: requiresConnection ?? self.requiresConnection,
            legacyRevision: legacyRevision,
            destinationRevision: destinationRevision,
            serverPick: serverPick,
            found: found ?? self.found,
            current: current
        )
    }
}

struct LegacyPickRecoverySheet: View {
    let presentation: LegacyRecoveryPresentation
    let authority: PrivatePickAuthority
    let isLocked: Bool
    let errorMessage: String?
    let onAction: (LegacyRecoverySheetAction) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isConfirmingReplace = false

    private var mode: LegacyRecoverySheetMode {
        LegacyRecoverySheetMode.resolve(
            isSignedIn: presentation.isSignedIn,
            authority: presentation.requiresConnection ? .unavailable : authority,
            hasDestination: presentation.current != nil
        )
    }

    private var actionMatrix: LegacyRecoverySheetActionMatrix {
        LegacyRecoverySheetActionMatrix.resolve(mode: mode, isLocked: isLocked)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(explanation)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    picksSection("Found on this iPhone", picks: presentation.found)

                    if mode == .conflict, let current = presentation.current {
                        picksSection("Current picks", picks: current)
                    }

                    if isLocked {
                        Label(
                            "This race is locked. You can keep or discard picks, but you can’t use found picks.",
                            systemImage: "lock.fill"
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }

                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(FXTheme.Colors.danger)
                            .accessibilityIdentifier("legacy-recovery-error")
                    }

                    actions
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemBackground))
            .navigationTitle("Picks found on this iPhone")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(false)
        .accessibilityIdentifier("legacy-pick-recovery-sheet")
        .confirmationDialog(
            "Replace current picks?",
            isPresented: $isConfirmingReplace,
            titleVisibility: .visible
        ) {
            Button("Replace with found picks", role: .destructive) {
                perform(.replace)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your current picks will be replaced by the picks found on this iPhone.")
        }
    }

    private var explanation: String {
        if !presentation.isSignedIn {
            return "These picks were saved by an older version of F10. Choose whether to keep them on this iPhone."
        }
        return "These picks were saved by an older version of F10. Choose whether to use them with this account."
    }

    @ViewBuilder
    private var actions: some View {
        VStack(spacing: 10) {
            switch mode {
            case .guest:
                primaryButton("Use on this iPhone", action: .use)
                    .disabled(!actionMatrix.isEnabled(.use))
                destructiveButton("Discard") { perform(.discard) }
            case .checking:
                statusRow("Checking account picks...", showsProgress: true)
                secondaryButton("Retry") { perform(.retry) }
            case .unavailable:
                statusRow("Connect to check account picks", showsProgress: false)
                secondaryButton("Retry") { perform(.retry) }
            case .emptyAccount:
                primaryButton("Use these picks", action: .use)
                    .disabled(!actionMatrix.isEnabled(.use))
                destructiveButton("Discard") { perform(.discard) }
            case .conflict:
                secondaryButton("Keep current picks") { perform(.keepCurrent) }
                Button {
                    isConfirmingReplace = true
                } label: {
                    Text("Replace with found picks")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(FXTheme.Colors.danger)
                .disabled(!actionMatrix.isEnabled(.replace))
                .accessibilityIdentifier("replace-found-picks")
                destructiveButton("Discard") { perform(.discard) }
            }

            secondaryButton("Not now") { perform(.notNow) }
                .accessibilityIdentifier("legacy-recovery-not-now")
        }
    }

    private func picksSection(
        _ title: String,
        picks: LegacyPickTriplet
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.headline)
                .padding(.bottom, 6)
            pickRow("P1", name: picks.winner)
            Divider()
            pickRow("P10", name: picks.tenthPlace)
            Divider()
            pickRow("DNF", name: picks.dnf)
        }
    }

    private func pickRow(_ role: String, name: String) -> some View {
        HStack(spacing: 14) {
            Text(role)
                .font(.system(size: 11, weight: .black, design: .monospaced))
                .foregroundStyle(FXTheme.Colors.accent)
                .frame(width: 36, alignment: .leading)
            Text(name)
                .font(.body.weight(.semibold))
            Spacer(minLength: 0)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(role), \(name)")
    }

    private func statusRow(_ text: String, showsProgress: Bool) -> some View {
        HStack(spacing: 10) {
            if showsProgress { ProgressView().controlSize(.small) }
            Image(systemName: showsProgress ? "icloud" : "wifi.slash")
                .opacity(showsProgress ? 0 : 1)
            Text(text).font(.subheadline.weight(.semibold))
            Spacer()
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private func primaryButton(
        _ title: String,
        action: LegacyRecoverySheetAction
    ) -> some View {
        Button(title) { perform(action) }
            .frame(maxWidth: .infinity, minHeight: 44)
            .buttonStyle(.borderedProminent)
    }

    private func secondaryButton(
        _ title: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, action: action)
            .frame(maxWidth: .infinity, minHeight: 44)
            .buttonStyle(.bordered)
    }

    private func destructiveButton(
        _ title: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, role: .destructive, action: action)
            .frame(maxWidth: .infinity, minHeight: 44)
            .buttonStyle(.bordered)
    }

    private func perform(_ action: LegacyRecoverySheetAction) {
        onAction(action)
        if action == .notNow {
            dismiss()
        }
    }
}
