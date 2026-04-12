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
    let totalScore: Int
}

struct RaceResult: Codable, Sendable {
    let driverId: String
    let position: Int?
    let status: ResultStatus
    let fastestLap: Bool
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
