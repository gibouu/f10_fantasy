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

    func testUpcomingRaceShowsSeasonFormBeforeQualifying() {
        XCTAssertEqual(
            RaceContextKind.resolve(
                section: .upcoming,
                hasQualifyingRows: false,
                hasResults: false,
                hasScoreBreakdown: false
            ),
            .seasonForm
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

    func testSeasonAverageFormattingUsesOneDecimalAndHandlesMissingHistory() {
        XCTAssertEqual(DriverSeasonForm.averageText(4.75), "4.8")
        XCTAssertEqual(DriverSeasonForm.averageText(5), "5.0")
        XCTAssertEqual(DriverSeasonForm.averageText(nil), "—")
    }
}
