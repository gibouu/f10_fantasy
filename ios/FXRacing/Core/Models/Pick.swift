import Foundation

struct Pick: Codable, Sendable {
    let id: String
    let raceId: String
    let tenthPlaceDriverId: String
    let winnerDriverId: String
    let dnfDriverId: String
    let lockedAt: Date?
    let scoreBreakdown: ScoreBreakdown?
}

struct ScoreBreakdown: Codable, Sendable {
    let tenthPlaceScore: Int
    let winnerBonus: Int
    let dnfBonus: Int
    /// Equal to (tenthPlaceScore + winnerBonus + dnfBonus) when the user
    /// submitted their pick before qualifying, otherwise 0. Optional with a
    /// default to remain backwards-compatible with legacy API responses
    /// (Codable will pick up the default when the key is absent).
    var earlyBirdBonus: Int = 0
    let totalScore: Int

    enum CodingKeys: String, CodingKey {
        case tenthPlaceScore, winnerBonus, dnfBonus, earlyBirdBonus, totalScore
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tenthPlaceScore = try c.decode(Int.self, forKey: .tenthPlaceScore)
        winnerBonus     = try c.decode(Int.self, forKey: .winnerBonus)
        dnfBonus        = try c.decode(Int.self, forKey: .dnfBonus)
        earlyBirdBonus  = try c.decodeIfPresent(Int.self, forKey: .earlyBirdBonus) ?? 0
        totalScore      = try c.decode(Int.self, forKey: .totalScore)
    }
}

struct RaceResult: Codable, Sendable {
    let driverId: String
    let position: Int?
    let status: ResultStatus
    let fastestLap: Bool
    let scoreGuide: ResultScoreGuide?
}

struct QualifyingResultRow: Codable, Sendable {
    let driverId: String
    let position: Int
}

struct ResultScoreGuide: Codable, Sendable {
    let p10: Int
    let winner: Int
    let dnf: Int
}

enum ResultStatus: String, Codable, Sendable {
    case classified = "CLASSIFIED"
    case dnf        = "DNF"
    case dns        = "DNS"
    case dsq        = "DSQ"
}

// MARK: - Pick slot

/// Identifies which pick slot is currently being edited.
enum PickSlot: String, Identifiable, Hashable, Sendable {
    case winner, p10, dnf

    var id: String { rawValue }

    /// Short UI label shown under each bubble.
    var label: String {
        switch self {
        case .winner: return "P1"
        case .p10:    return "P10"
        case .dnf:    return "DNF"
        }
    }

    /// Sheet title when picking a driver for this slot.
    var sheetTitle: String {
        switch self {
        case .winner: return "Pick Winner"
        case .p10:    return "Pick P10"
        case .dnf:    return "Pick DNF"
        }
    }
}
