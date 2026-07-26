import Foundation

struct PickSelection: Codable, Equatable, Sendable {
    let winnerDriverID: String
    let tenthPlaceDriverID: String
    let dnfDriverID: String
}

enum PickOwnerScope: Codable, Hashable, Sendable {
    case guest
    case user(String)
    case legacyAmbiguous
}

struct LocalPickRecordID: Codable, Equatable, Hashable, Sendable {
    let owner: PickOwnerScope
    let raceID: String
}

enum PickConflictReason: String, Codable, Equatable, Sendable {
    case serverWins
    case accountPickFound
    case legacyNeedsReview
}

enum PickSyncMode: String, Codable, Equatable, Sendable {
    case direct
    case guestMigration
    case authenticatedRetry
}

enum LocalPickSyncState: Codable, Equatable, Sendable {
    case reviewRequired
    case queued
    case syncing(revision: UInt64, mode: PickSyncMode)
    case confirmed
    case conflict(PickConflictReason)
    case expired
}

enum LegacyPickRecoveryResult: Equatable, Sendable {
    case recovered(LocalPickRecord)
    case destinationOccupied(LocalPickRecord)
    case notFound
    case locked
    case invalidOwner
    case persistenceFailed
}

enum LegacyPickDecision: Equatable, Sendable {
    case discard
    case adopt
    case keepCurrent(expectedDestinationRevision: UInt64?)
    case replace(expectedDestinationRevision: UInt64)
}

enum LegacyPickResolutionResult: Equatable, Sendable {
    case adopted(LocalPickRecord)
    case discarded
    case keptCurrent
    case locked
    case staleLegacy
    case destinationOccupied(LocalPickRecord)
    case destinationChanged(LocalPickRecord?)
    case invalidOwner
    case persistenceFailed
}

struct LocalPickRecord: Codable, Equatable, Sendable, Identifiable {
    let id: LocalPickRecordID
    let selection: PickSelection
    let savedAt: Date
    let revision: UInt64
    var syncState: LocalPickSyncState
}

enum LocalPickSaveResult: Equatable, Sendable {
    case saved(LocalPickRecord)
    case unchanged(LocalPickRecord)
    case locked
    case invalidOwner
    case persistenceFailed
}
