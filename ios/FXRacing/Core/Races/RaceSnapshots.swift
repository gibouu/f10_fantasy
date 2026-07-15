import Foundation

struct RaceListSnapshot: Codable, Sendable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let savedAt: Date
    let season: Season?
    let races: [Race]
    let validatedDetailSeasonID: String?

    init(
        schemaVersion: Int,
        savedAt: Date,
        season: Season?,
        races: [Race],
        validatedDetailSeasonID: String? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.savedAt = savedAt
        self.season = season
        self.races = races
        self.validatedDetailSeasonID = validatedDetailSeasonID
    }
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
