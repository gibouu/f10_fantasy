import XCTest
@testable import FXRacing

final class RacePickStatusResolverTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    func testIncompleteCopyCountsEveryRemainingPick() {
        XCTAssertEqual(resolve(selectionCount: 0), status("Choose 3 more", detail: bonusGuidance))
        XCTAssertEqual(resolve(selectionCount: 1), status("Choose 2 more", detail: bonusGuidance))
        XCTAssertEqual(resolve(selectionCount: 2), status("Choose 1 more", detail: bonusGuidance))
    }

    func testLocalWriteStatesTakePrecedenceOverSyncStates() {
        XCTAssertEqual(
            resolve(submissionState: .savingLocally, localRevision: 4),
            status("Saving...", showsProgress: true)
        )
        XCTAssertEqual(
            resolve(
                submissionState: .savedToAccount,
                didLocalWriteFail: true,
                localRevision: 4,
                acknowledgedRevision: 4
            ),
            status(
                "Couldn't save on this iPhone",
                detail: "Try again",
                action: .retry
            )
        )
    }

    func testCurrentRevisionConfirmationUsesStrictServerBonusAuthority() {
        XCTAssertEqual(
            resolve(
                submissionState: .savedToAccount,
                localRevision: 4,
                acknowledgedRevision: 4,
                bonusAuthority: .eligible
            ),
            status(
                "Saved to account",
                detail: "2× bonus eligible",
                systemImage: "checkmark.circle.fill"
            )
        )
        XCTAssertEqual(
            resolve(
                submissionState: .savedToAccount,
                localRevision: 4,
                acknowledgedRevision: 4,
                bonusAuthority: .secured
            ),
            status(
                "Saved to account",
                detail: "2× bonus secured",
                systemImage: "checkmark.circle.fill"
            )
        )
        XCTAssertEqual(
            resolve(
                submissionState: .savedToAccount,
                localRevision: 4,
                acknowledgedRevision: 4,
                bonusAuthority: .notEligible
            ),
            status("Saved to account", systemImage: "checkmark.circle.fill")
        )
    }

    func testStaleAcknowledgementCannotDisplaceTheCurrentQueuedRevision() {
        XCTAssertEqual(
            resolve(
                submissionState: .savedToAccount,
                localRevision: 5,
                acknowledgedRevision: 4
            ),
            status(
                "Saved on this iPhone",
                detail: "Sync before qualifying for 2×",
                systemImage: "checkmark.circle.fill"
            )
        )
    }

    func testSignedInQueuedAndSyncingCopyStaysLocalUntilAcknowledged() {
        for state in [PickSubmissionState.savedOnDevice, .syncing] {
            XCTAssertEqual(
                resolve(submissionState: state, localRevision: 4),
                status(
                    "Saved on this iPhone",
                    detail: "Sync before qualifying for 2×",
                    systemImage: "checkmark.circle.fill"
                )
            )
        }
    }

    func testOfflineGuestAndUnauthorizedCopyNeverClaimsTheBonus() {
        XCTAssertEqual(
            resolve(submissionState: .savedOnDevice, syncIssue: .offline, localRevision: 4),
            status(
                "Saved on this iPhone",
                detail: "Will sync when online",
                systemImage: "checkmark.circle.fill"
            )
        )
        XCTAssertEqual(
            resolve(submissionState: .savedOnDevice, isAuthenticated: false, localRevision: 4),
            status(
                "Saved on this iPhone",
                detail: "Sign in",
                systemImage: "checkmark.circle.fill",
                action: .signIn
            )
        )
        XCTAssertEqual(
            resolve(submissionState: .savedOnDevice, syncIssue: .unauthorized, localRevision: 4),
            status(
                "Saved on this iPhone",
                detail: "Sign in again to sync",
                systemImage: "checkmark.circle.fill",
                action: .signIn
            )
        )
    }

    func testLockedRejectedRevisionAndConflictHaveHighestPrecedence() {
        XCTAssertEqual(
            resolve(
                submissionState: .expired,
                isLocked: true,
                localRevision: 4,
                currentRevisionRejected: true
            ),
            status(
                "Race locked",
                detail: "Latest changes weren't submitted",
                systemImage: "lock.fill"
            )
        )
        XCTAssertEqual(
            resolve(submissionState: .conflict, localRevision: 4),
            status(
                "Account picks need attention",
                detail: "Choose picks",
                systemImage: "exclamationmark.triangle.fill",
                action: .resolveConflict
            )
        )
        XCTAssertEqual(
            resolve(
                submissionState: .conflict,
                didLocalWriteFail: true,
                localRevision: 4
            ).title,
            "Account picks need attention"
        )
    }

    private var bonusGuidance: String { "Finish before qualifying for 2×" }

    private func resolve(
        selectionCount: Int = 3,
        submissionState: PickSubmissionState = .idle,
        isAuthenticated: Bool = true,
        syncIssue: RacePickSyncIssue? = nil,
        didLocalWriteFail: Bool = false,
        isLocked: Bool = false,
        localRevision: UInt64? = nil,
        acknowledgedRevision: UInt64? = nil,
        currentRevisionRejected: Bool = false,
        bonusAuthority: PickBonusAuthority = .notEligible
    ) -> RacePickStatus {
        RacePickStatusResolver.resolve(
            RacePickStatusContext(
                selectionCount: selectionCount,
                submissionState: submissionState,
                isAuthenticated: isAuthenticated,
                syncIssue: syncIssue,
                didLocalWriteFail: didLocalWriteFail,
                isLocked: isLocked,
                localRevision: localRevision,
                acknowledgedRevision: acknowledgedRevision,
                currentRevisionRejected: currentRevisionRejected,
                bonusAuthority: bonusAuthority,
                qualifyingStartUtc: now.addingTimeInterval(3_600),
                now: now
            )
        )
    }

    private func status(
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
