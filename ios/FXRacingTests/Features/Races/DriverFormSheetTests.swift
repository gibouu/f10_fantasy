import XCTest
@testable import FXRacing

final class DriverFormSheetTests: XCTestCase {
    func testResultLabelsPreserveClassifiedAndNonClassifiedStatuses() {
        XCTAssertEqual(result(resultStatus: .classified, position: 8).resultLabel, "P8")
        XCTAssertEqual(result(resultStatus: .dnf, position: nil).resultLabel, "DNF")
        XCTAssertEqual(result(resultStatus: .dns, position: nil).resultLabel, "DNS")
        XCTAssertEqual(result(resultStatus: .dsq, position: nil).resultLabel, "DSQ")
    }

    func testClassifiedResultWithoutPositionUsesFallbackLabel() {
        XCTAssertEqual(result(resultStatus: .classified, position: nil).resultLabel, "—")
    }

    func testCopyAdaptsToMainAndSprintRaceTypes() {
        XCTAssertEqual(
            DriverFormSheet.contextLabel(for: RaceFixtures.upcoming),
            "Race results before Belgium"
        )
        XCTAssertEqual(
            DriverFormSheet.emptyHistoryText(for: RaceFixtures.upcoming),
            "No completed races yet."
        )

        let sprint = Race(
            id: "sprint",
            seasonId: "season-2026",
            round: 2,
            name: "Belgian Sprint",
            circuitName: "Spa-Francorchamps",
            country: "Belgium",
            type: .sprint,
            scheduledStartUtc: RaceFixtures.now.addingTimeInterval(86_400),
            lockCutoffUtc: RaceFixtures.now.addingTimeInterval(86_280),
            status: .upcoming,
            qualifyingStartUtc: nil
        )
        XCTAssertEqual(
            DriverFormSheet.contextLabel(for: sprint),
            "Sprint results before Belgium"
        )
        XCTAssertEqual(
            DriverFormSheet.emptyHistoryText(for: sprint),
            "No completed sprints yet."
        )
    }

    private func result(
        resultStatus: ResultStatus,
        position: Int?
    ) -> DriverSeasonResult {
        DriverSeasonResult(
            raceId: "race",
            raceName: "Belgian Grand Prix",
            scheduledStartUtc: RaceFixtures.now,
            position: position,
            status: resultStatus
        )
    }
}
