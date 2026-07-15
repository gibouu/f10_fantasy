import Foundation
@testable import FXRacing

enum RaceFixtures {
    static let now = Date(timeIntervalSince1970: 1_800_000_000)
    static func race(id: String, round: Int, status: RaceStatus, startOffset: TimeInterval) -> Race {
        Race(
            id: id,
            seasonId: "season-2026",
            round: round,
            name: "Race \(round)",
            circuitName: "Circuit \(round)",
            country: "Belgium",
            type: .main,
            scheduledStartUtc: now.addingTimeInterval(startOffset),
            lockCutoffUtc: now.addingTimeInterval(startOffset - 120),
            status: status,
            qualifyingStartUtc: now.addingTimeInterval(startOffset - 86_400)
        )
    }

    static let season2026 = Season(id: "season-2026", year: 2026)
    static let upcoming = race(id: "monza", round: 2, status: .upcoming, startOffset: 172_800)
    static let liveSpa = race(id: "spa", round: 1, status: .live, startOffset: 3_600)
    static let completedSpa = race(id: "spa", round: 1, status: .completed, startOffset: -3_600)
    static let upcomingMonza = upcoming
}
