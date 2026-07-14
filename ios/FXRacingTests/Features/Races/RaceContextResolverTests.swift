import XCTest
@testable import FXRacing

final class RaceContextResolverTests: XCTestCase {
    func testUpcomingRaceShowsQualifyingAsSoonAsRowsExist() {
        XCTAssertEqual(
            RaceContextKind.resolve(
                section: .upcoming,
                hasQualifyingRows: true,
                hasResults: false,
                hasScoreBreakdown: false
            ),
            .qualifying
        )
    }

    func testUpcomingRaceFallsBackToPreviousRaceBeforeQualifying() {
        XCTAssertEqual(
            RaceContextKind.resolve(
                section: .upcoming,
                hasQualifyingRows: false,
                hasResults: false,
                hasScoreBreakdown: false
            ),
            .previousRace
        )
    }

    func testPastRacePrefersClassificationThenQualifyingThenScore() {
        XCTAssertEqual(
            RaceContextKind.resolve(
                section: .past,
                hasQualifyingRows: true,
                hasResults: true,
                hasScoreBreakdown: true
            ),
            .results
        )
        XCTAssertEqual(
            RaceContextKind.resolve(
                section: .past,
                hasQualifyingRows: true,
                hasResults: false,
                hasScoreBreakdown: true
            ),
            .qualifying
        )
        XCTAssertEqual(
            RaceContextKind.resolve(
                section: .past,
                hasQualifyingRows: false,
                hasResults: false,
                hasScoreBreakdown: true
            ),
            .scoreSummary
        )
    }

    func testNearestEarlierCompletedRaceDoesNotSelectFutureOrCancelledRace() {
        let selected = RaceFixtures.race(
            id: "selected",
            round: 6,
            status: .upcoming,
            startOffset: 600
        )
        let nearest = RaceFixtures.race(
            id: "nearest",
            round: 5,
            status: .completed,
            startOffset: 300
        )
        let older = RaceFixtures.race(
            id: "older",
            round: 4,
            status: .completed,
            startOffset: 100
        )
        let cancelled = RaceFixtures.race(
            id: "cancelled",
            round: 5,
            status: .cancelled,
            startOffset: 400
        )

        XCTAssertEqual(
            RaceContextResolver.previousCompletedRace(
                before: selected,
                in: [selected, older, cancelled, nearest]
            )?.id,
            nearest.id
        )
    }
}
