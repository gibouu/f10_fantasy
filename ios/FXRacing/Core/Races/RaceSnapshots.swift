import Foundation

struct RaceListSnapshot: Codable, Sendable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let savedAt: Date
    let season: Season?
    let races: [Race]
}

struct RaceDetailSnapshot: Codable, Sendable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let savedAt: Date
    let race: Race
    let entrants: [Driver]
    let results: [RaceResult]
    let qualifyingResults: [QualifyingResultRow]
}
