import Foundation

struct Race: Codable, Sendable, Identifiable {
    let id: String
    let seasonId: String
    let round: Int
    let name: String
    let circuitName: String
    let country: String
    let type: RaceType
    let scheduledStartUtc: Date
    let lockCutoffUtc: Date
    let status: RaceStatus

    var isLocked: Bool { Date() >= lockCutoffUtc }
    var isSprint: Bool { type == .sprint }
    var flagEmoji: String { Race.flag(for: country) }

    /// Maximum scores for each slot, used to colour-code score badges.
    var scoreCaps: ScoreCaps {
        isSprint
            ? ScoreCaps(p10: 8, winner: 2, dnf: 1)
            : ScoreCaps(p10: 25, winner: 5, dnf: 3)
    }

    private static func flag(for country: String) -> String {
        let map: [String: String] = [
            "Bahrain": "🇧🇭", "Saudi Arabia": "🇸🇦", "Australia": "🇦🇺",
            "Japan": "🇯🇵", "China": "🇨🇳",
            "United States": "🇺🇸", "USA": "🇺🇸", "Miami": "🇺🇸", "Las Vegas": "🇺🇸",
            "Italy": "🇮🇹", "Monaco": "🇲🇨", "Canada": "🇨🇦",
            "Spain": "🇪🇸", "Austria": "🇦🇹", "United Kingdom": "🇬🇧",
            "Hungary": "🇭🇺", "Belgium": "🇧🇪", "Netherlands": "🇳🇱",
            "Singapore": "🇸🇬", "Azerbaijan": "🇦🇿", "Mexico": "🇲🇽",
            "Brazil": "🇧🇷", "Qatar": "🇶🇦", "United Arab Emirates": "🇦🇪",
        ]
        return map[country] ?? "🏎️"
    }
}

struct ScoreCaps: Sendable {
    let p10: Int
    let winner: Int
    let dnf: Int
}

struct Season: Codable, Sendable, Identifiable {
    let id: String
    let year: Int
}

enum RaceType: String, Codable, Sendable {
    case main   = "MAIN"
    case sprint = "SPRINT"
}

enum RaceStatus: String, Codable, Sendable {
    case upcoming  = "UPCOMING"
    case live      = "LIVE"
    case completed = "COMPLETED"
    case cancelled = "CANCELLED"
}
