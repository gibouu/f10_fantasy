import SwiftUI

enum RacePickStatusAction: Equatable, Sendable {
    case none
    case retry
    case signIn
    case resolveConflict
}

enum RacePickSyncIssue: Equatable, Sendable {
    case offline
    case unauthorized
}

struct RacePickStatus: Equatable, Sendable {
    let title: String
    let detail: String?
    let systemImage: String?
    let action: RacePickStatusAction
    let showsProgress: Bool
}

struct RacePickStatusContext: Equatable, Sendable {
    let selectionCount: Int
    let submissionState: PickSubmissionState
    let isAuthenticated: Bool
    let syncIssue: RacePickSyncIssue?
    let didLocalWriteFail: Bool
    let isLocked: Bool
    let localRevision: UInt64?
    let acknowledgedRevision: UInt64?
    let currentRevisionRejected: Bool
    let bonusAuthority: PickBonusAuthority
    let qualifyingStartUtc: Date?
    let now: Date
}

enum RacePickStatusResolver {
    static func resolve(_ context: RacePickStatusContext) -> RacePickStatus {
        if context.isLocked || context.submissionState == .expired {
            return status(
                "Race locked",
                detail: context.currentRevisionRejected
                    ? "Latest changes weren't submitted"
                    : nil,
                systemImage: "lock.fill"
            )
        }

        if isAuthorityConflict(context.submissionState) {
            return status(
                "Account picks need attention",
                detail: "Choose picks",
                systemImage: "exclamationmark.triangle.fill",
                action: .resolveConflict
            )
        }

        if context.didLocalWriteFail {
            return status(
                "Couldn't save on this iPhone",
                detail: "Try again",
                action: .retry
            )
        }

        if context.submissionState == .savingLocally {
            return status("Saving...", showsProgress: true)
        }

        if isCurrentRevisionConfirmed(context) {
            return status(
                "Picks saved",
                detail: confirmedBonusDetail(context.bonusAuthority),
                systemImage: "checkmark.circle.fill"
            )
        }

        if context.localRevision != nil || isLocallyPersisted(context.submissionState) {
            if context.syncIssue == .unauthorized {
                return status(
                    "Saved on this iPhone",
                    detail: "Sign in again to sync",
                    systemImage: "checkmark.circle.fill",
                    action: .signIn
                )
            }

            if context.syncIssue == .offline {
                return status(
                    "Saved on this iPhone",
                    detail: "Will sync when online",
                    systemImage: "checkmark.circle.fill"
                )
            }

            if !context.isAuthenticated {
                return status(
                    "Saved on this iPhone",
                    detail: "Sign in",
                    systemImage: "checkmark.circle.fill",
                    action: .signIn
                )
            }

            return status(
                "Saved on this iPhone",
                detail: context.qualifyingStartUtc.map { context.now < $0 } == true
                    ? "Sync before qualifying for 2×"
                    : nil,
                systemImage: "checkmark.circle.fill"
            )
        }

        let remaining = max(0, 3 - context.selectionCount)
        if remaining > 0 {
            return status(
                "Choose \(remaining) more",
                detail: "Finish before qualifying for 2×"
            )
        }

        return status("Saving...", showsProgress: true)
    }

    private static func isCurrentRevisionConfirmed(
        _ context: RacePickStatusContext
    ) -> Bool {
        guard context.submissionState == .savedToAccount else { return false }
        guard let localRevision = context.localRevision else { return true }
        return context.acknowledgedRevision == localRevision
    }

    private static func isAuthorityConflict(_ state: PickSubmissionState) -> Bool {
        switch state {
        case .reviewRequired, .missingFromAccount, .conflict:
            return true
        case .idle, .savingLocally, .savedOnDevice, .syncing,
             .savedToAccount, .expired:
            return false
        }
    }

    private static func isLocallyPersisted(_ state: PickSubmissionState) -> Bool {
        switch state {
        case .savedOnDevice, .syncing:
            return true
        case .idle, .reviewRequired, .savingLocally, .savedToAccount,
             .missingFromAccount, .conflict, .expired:
            return false
        }
    }

    private static func confirmedBonusDetail(
        _ authority: PickBonusAuthority
    ) -> String? {
        switch authority {
        case .notEligible: nil
        case .eligible: "2× bonus eligible"
        case .secured: "2× bonus secured"
        }
    }

    private static func status(
        _ title: String,
        detail: String? = nil,
        systemImage: String? = nil,
        action: RacePickStatusAction = .none,
        showsProgress: Bool = false
    ) -> RacePickStatus {
        RacePickStatus(
            title: title,
            detail: detail,
            systemImage: systemImage,
            action: action,
            showsProgress: showsProgress
        )
    }
}

struct RacePickStatusRail: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let status: RacePickStatus
    let onAction: (RacePickStatusAction) -> Void

    var body: some View {
        Group {
            if status.action == .none {
                content
            } else {
                Button {
                    onAction(status.action)
                } label: {
                    content
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(status.title)
        .accessibilityValue(accessibilityValue)
        .accessibilityHint(accessibilityHint)
    }

    private var content: some View {
        HStack(alignment: dynamicTypeSize.isAccessibilitySize ? .top : .center, spacing: 9) {
            if status.showsProgress {
                ProgressView()
                    .controlSize(.small)
                    .padding(.top, dynamicTypeSize.isAccessibilitySize ? 2 : 0)
            } else if let systemImage = status.systemImage {
                Image(systemName: systemImage)
                    .font(.caption.weight(.bold))
                    .padding(.top, dynamicTypeSize.isAccessibilitySize ? 4 : 0)
            } else {
                Image(systemName: "circle")
                    .font(.system(size: 7, weight: .bold))
                    .padding(.top, dynamicTypeSize.isAccessibilitySize ? 8 : 0)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(status.title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                Text(status.detail ?? " ")
                    .font(.caption2)
                    .foregroundStyle(status.action == .none ? .secondary : FXTheme.Colors.accent)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
            }

            Spacer(minLength: 0)
        }
        .foregroundStyle(foregroundStyle)
        .contentShape(Rectangle())
    }

    private var foregroundStyle: Color {
        switch status.action {
        case .retry, .resolveConflict: FXTheme.Colors.danger
        case .none, .signIn: .primary
        }
    }

    private var accessibilityValue: String {
        status.detail ?? status.title
    }

    private var accessibilityHint: String {
        switch status.action {
        case .none: ""
        case .retry: "Retries saving your picks."
        case .signIn: "Opens sign in."
        case .resolveConflict: "Opens the driver picker to choose picks."
        }
    }
}
