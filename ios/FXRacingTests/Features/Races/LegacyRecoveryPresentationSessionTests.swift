import XCTest
@testable import FXRacing

@MainActor
final class LegacyRecoveryPresentationSessionTests: XCTestCase {
    func testClaimsEachRaceAndPrivateScopeOnlyOncePerAppSession() {
        let session = LegacyRecoveryPresentationSession()

        XCTAssertTrue(session.claim(raceID: "spa", privateScopeID: "device"))
        XCTAssertFalse(session.claim(raceID: "spa", privateScopeID: "device"))
        XCTAssertTrue(session.claim(raceID: "monza", privateScopeID: "device"))
        XCTAssertTrue(session.claim(raceID: "spa", privateScopeID: "user:a"))
        XCTAssertFalse(session.claim(raceID: "spa", privateScopeID: "user:a"))
    }

    func testSectionRoundTripKeepsTheSameClaimedPresentation() {
        let shellOwnedSession = LegacyRecoveryPresentationSession()
        let upcomingReference = shellOwnedSession
        let pastReference = shellOwnedSession

        XCTAssertTrue(
            upcomingReference.claim(raceID: "spa", privateScopeID: "device")
        )
        XCTAssertFalse(
            pastReference.claim(raceID: "spa", privateScopeID: "device")
        )
    }

    func testNewAppSessionCanPresentTheSameRaceAndScopeAgain() {
        let firstLaunch = LegacyRecoveryPresentationSession()
        let nextLaunch = LegacyRecoveryPresentationSession()

        XCTAssertTrue(firstLaunch.claim(raceID: "spa", privateScopeID: "device"))
        XCTAssertTrue(nextLaunch.claim(raceID: "spa", privateScopeID: "device"))
    }

    func testGuestAndSignedInRecoveryMatrixNeverTreatsUnknownAuthorityAsEmpty() {
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: false,
                authority: .notRequired,
                hasDestination: false
            ),
            .guest
        )
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: true,
                authority: .checking,
                hasDestination: false
            ),
            .checking
        )
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: true,
                authority: .unavailable,
                hasDestination: false
            ),
            .unavailable
        )
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: true,
                authority: .unauthorized,
                hasDestination: false
            ),
            .unavailable
        )
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: true,
                authority: .missing,
                hasDestination: false
            ),
            .emptyAccount
        )
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: true,
                authority: .missing,
                hasDestination: true
            ),
            .conflict
        )
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: true,
                authority: .found,
                hasDestination: false
            ),
            .conflict
        )
    }

    func testAccountUnavailableRecoveryContextNeverUsesGuestActions() {
        let context = LegacyRecoveryAccountContext.resolve(
            authState: .accountUnavailable
        )

        XCTAssertTrue(context.isSignedIn)
        XCTAssertTrue(context.requiresConnection)
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: context.isSignedIn,
                authority: .unavailable,
                hasDestination: false
            ),
            .unavailable
        )
        XCTAssertEqual(
            LegacyRecoverySheetActionMatrix.resolve(
                mode: .unavailable,
                isLocked: false
            ).actions,
            [.retry, .notNow]
        )
    }

    func testUnavailablePresentationHasNoMutationOwner() {
        let presentation = LegacyRecoveryPresentation(
            raceID: "spa",
            privateScopeID: "device",
            userID: nil,
            isSignedIn: true,
            requiresConnection: true,
            legacyRevision: 3,
            destinationRevision: nil,
            serverPick: nil,
            found: fixtureTriplet("found"),
            current: nil
        )

        XCTAssertNil(presentation.mutationOwner)
    }

    func testGuestAndResolvedSignedPresentationMutationOwnersAreExplicit() {
        let guest = LegacyRecoveryPresentation(
            raceID: "spa",
            privateScopeID: "device",
            userID: nil,
            isSignedIn: false,
            requiresConnection: false,
            legacyRevision: 3,
            destinationRevision: nil,
            serverPick: nil,
            found: fixtureTriplet("found"),
            current: nil
        )
        let signed = LegacyRecoveryPresentation(
            raceID: "spa",
            privateScopeID: "user:a",
            userID: "a",
            isSignedIn: true,
            requiresConnection: false,
            legacyRevision: 3,
            destinationRevision: nil,
            serverPick: nil,
            found: fixtureTriplet("found"),
            current: nil
        )

        XCTAssertEqual(guest.mutationOwner, .guest)
        XCTAssertEqual(signed.mutationOwner, .user("a"))
    }

    func testCheckingPresentationRefreshesFoundAndMissingAuthorityWithoutASecondClaim() {
        let session = LegacyRecoveryPresentationSession()
        XCTAssertTrue(session.claim(raceID: "spa", privateScopeID: "user:a"))

        let checking = LegacyRecoveryPresentation(
            raceID: "spa",
            privateScopeID: "user:a",
            userID: "a",
            isSignedIn: true,
            requiresConnection: false,
            legacyRevision: 3,
            destinationRevision: nil,
            serverPick: nil,
            found: fixtureTriplet("found"),
            current: nil
        )
        let missing = checking.refreshed(
            destinationRevision: nil,
            serverPick: nil,
            current: nil
        )
        XCTAssertEqual(
            LegacyRecoverySheetMode.resolve(
                isSignedIn: missing.isSignedIn,
                authority: .missing,
                hasDestination: missing.current != nil
            ),
            .emptyAccount
        )

        let fingerprint = LegacyPrivatePickSnapshot(
            id: "server-v2",
            selection: PickSelection(
                winnerDriverID: "p1",
                tenthPlaceDriverID: "p10",
                dnfDriverID: "dnf"
            ),
            updatedAt: Date(timeIntervalSince1970: 2)
        )
        let found = checking.refreshed(
            destinationRevision: 8,
            serverPick: fingerprint,
            current: fixtureTriplet("current")
        )
        XCTAssertEqual(found.destinationRevision, 8)
        XCTAssertEqual(found.serverPick, fingerprint)
        XCTAssertEqual(found.current, fixtureTriplet("current"))
        XCTAssertEqual(found.id, checking.id)
        XCTAssertFalse(session.claim(raceID: "spa", privateScopeID: "user:a"))
    }

    func testLockedActionMatrixKeepsResolutionActionsAvailableAndRequiresReplaceConfirmation() {
        let matrix = LegacyRecoverySheetActionMatrix.resolve(
            mode: .conflict,
            isLocked: true
        )

        XCTAssertEqual(matrix.actions, [.keepCurrent, .replace, .discard, .notNow])
        XCTAssertFalse(matrix.isEnabled(.replace))
        XCTAssertTrue(matrix.isEnabled(.keepCurrent))
        XCTAssertTrue(matrix.isEnabled(.discard))
        XCTAssertTrue(matrix.requiresConfirmation(.replace))
    }

    private func fixtureTriplet(_ suffix: String) -> LegacyPickTriplet {
        LegacyPickTriplet(
            winner: "P1 \(suffix)",
            tenthPlace: "P10 \(suffix)",
            dnf: "DNF \(suffix)"
        )
    }
}
