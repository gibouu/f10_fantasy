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
}
