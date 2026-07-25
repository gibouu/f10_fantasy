import Foundation

struct Pick: Codable, Sendable {
    let id: String
    let raceId: String
    let tenthPlaceDriverId: String
    let winnerDriverId: String
    let dnfDriverId: String
    let version: String?
    let lockedAt: Date?
    let scoreBreakdown: ScoreBreakdown?
    var updatedAt: Date? = nil
    var lockedSubmittedBeforeQualifying: Bool? = nil

    init(
        id: String,
        raceId: String,
        tenthPlaceDriverId: String,
        winnerDriverId: String,
        dnfDriverId: String,
        version: String? = nil,
        lockedAt: Date?,
        scoreBreakdown: ScoreBreakdown?,
        updatedAt: Date? = nil,
        lockedSubmittedBeforeQualifying: Bool? = nil
    ) {
        self.id = id
        self.raceId = raceId
        self.tenthPlaceDriverId = tenthPlaceDriverId
        self.winnerDriverId = winnerDriverId
        self.dnfDriverId = dnfDriverId
        self.version = version
        self.lockedAt = lockedAt
        self.scoreBreakdown = scoreBreakdown
        self.updatedAt = updatedAt
        self.lockedSubmittedBeforeQualifying = lockedSubmittedBeforeQualifying
    }
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

    init(
        tenthPlaceScore: Int,
        winnerBonus: Int,
        dnfBonus: Int,
        earlyBirdBonus: Int = 0,
        totalScore: Int
    ) {
        self.tenthPlaceScore = tenthPlaceScore
        self.winnerBonus = winnerBonus
        self.dnfBonus = dnfBonus
        self.earlyBirdBonus = earlyBirdBonus
        self.totalScore = totalScore
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
enum PickSlot: String, CaseIterable, Identifiable, Hashable, Sendable {
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

    var next: PickSlot? {
        switch self {
        case .winner: return .p10
        case .p10:    return .dnf
        case .dnf:    return nil
        }
    }
}

/// Pure interaction state for the progressive driver picker.
struct DriverPickerState: Sendable {
    var activeSlot: PickSlot
    private(set) var selectedDriverIDs: [PickSlot: String]
    var isLocked: Bool
    private(set) var isPresented: Bool

    init(
        activeSlot: PickSlot,
        selectedDriverIDs: [PickSlot: String],
        isLocked: Bool
    ) {
        self.activeSlot = activeSlot
        self.selectedDriverIDs = selectedDriverIDs
        self.isLocked = isLocked
        isPresented = true
    }

    static func startingSlot(
        requested: PickSlot,
        selectedDriverIDs: [PickSlot: String]
    ) -> PickSlot {
        selectedDriverIDs.isEmpty ? .winner : requested
    }

    @discardableResult
    mutating func select(_ driver: Driver) -> Bool {
        guard isAvailable(driver) else { return false }

        selectedDriverIDs[activeSlot] = driver.id
        activeSlot = activeSlot.next ?? activeSlot
        return true
    }

    func isAvailable(_ driver: Driver) -> Bool {
        unavailabilityReason(for: driver) == nil
    }

    func unavailabilityReason(for driver: Driver) -> String? {
        if isLocked {
            return "Picks are locked."
        }

        guard let conflictingSlot = PickSlot.allCases.first(where: {
            $0 != activeSlot && selectedDriverIDs[$0] == driver.id
        }) else {
            return nil
        }

        return "Already selected for \(conflictingSlot.label)."
    }

    mutating func apply(
        _ updatedState: DriverPickerState,
        outcome: PickSelectionOutcome
    ) -> DriverPickerSelectionEffect {
        switch outcome {
        case .incomplete:
            self = updatedState
            return .advance
        case .committed(let ticket):
            self = updatedState
            isPresented = false
            return .dismiss(ticket)
        case .rejected(let message):
            return .showError(message)
        }
    }
}

enum DriverPickerSelectionEffect: Equatable, Sendable {
    case advance
    case dismiss(PickCommitTicket)
    case showError(String)
}
