import Foundation
@testable import FXRacing

struct TestClock: ClockProviding {
    let date: Date

    func now() -> Date { date }

    static let fixed = TestClock(date: RaceFixtures.now)
}
