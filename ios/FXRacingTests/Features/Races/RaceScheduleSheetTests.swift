import XCTest
@testable import FXRacing

final class RaceScheduleSheetTests: XCTestCase {
    func testMainRaceScheduleIncludesQualifyingBonusLockAndRaceStart() {
        let qualifying = Date(timeIntervalSince1970: 1_800_010_000)
        let lock = Date(timeIntervalSince1970: 1_800_096_280)
        let start = Date(timeIntervalSince1970: 1_800_096_400)
        let race = makeRace(
            type: .main,
            qualifyingStartUtc: qualifying,
            lockCutoffUtc: lock,
            scheduledStartUtc: start
        )

        let rows = RaceScheduleRow.resolve(for: race)

        XCTAssertEqual(rows.map(\.kind), [.qualifying, .bonusCutoff, .lockCutoff, .eventStart])
        XCTAssertEqual(rows.map(\.title), ["Qualifying", "2× bonus cutoff", "Picks lock", "Race start"])
        XCTAssertEqual(rows.map(\.date), [qualifying, qualifying, lock, start])
        XCTAssertEqual(
            rows.map(\.accessibilityIdentifier),
            [
                "schedule-qualifying",
                "schedule-bonus-cutoff",
                "schedule-lock-cutoff",
                "schedule-event-start",
            ]
        )
    }

    func testSprintScheduleUsesShootoutAndSprintLabels() {
        let qualifying = Date(timeIntervalSince1970: 1_800_010_000)
        let race = makeRace(type: .sprint, qualifyingStartUtc: qualifying)

        let rows = RaceScheduleRow.resolve(for: race)

        XCTAssertEqual(rows.map(\.title), ["Sprint Shootout", "2× bonus cutoff", "Picks lock", "Sprint start"])
        XCTAssertEqual(rows.first?.date, qualifying)
        XCTAssertEqual(rows.dropFirst().first?.date, qualifying)
    }

    func testMissingQualifyingTimeOmitsQualifyingAndBonusRows() {
        let race = makeRace(type: .main, qualifyingStartUtc: nil)

        let rows = RaceScheduleRow.resolve(for: race)

        XCTAssertEqual(rows.map(\.kind), [.lockCutoff, .eventStart])
        XCTAssertEqual(rows.map(\.title), ["Picks lock", "Race start"])
    }

    private func makeRace(
        type: RaceType,
        qualifyingStartUtc: Date?,
        lockCutoffUtc: Date = Date(timeIntervalSince1970: 1_800_096_280),
        scheduledStartUtc: Date = Date(timeIntervalSince1970: 1_800_096_400)
    ) -> Race {
        Race(
            id: "schedule-race",
            seasonId: "season-2026",
            round: 8,
            name: type == .sprint ? "Belgian Sprint" : "Belgian Grand Prix",
            circuitName: "Circuit de Spa-Francorchamps",
            country: "Belgium",
            type: type,
            scheduledStartUtc: scheduledStartUtc,
            lockCutoffUtc: lockCutoffUtc,
            status: .upcoming,
            qualifyingStartUtc: qualifyingStartUtc
        )
    }
}
