struct RaceListPayload: Codable, Sendable {
    let races: [Race]
    let season: Season?
}

struct RaceDetailPayload: Codable, Sendable {
    let race: Race
    let entrants: [Driver]
    let results: [RaceResult]
    let qualifyingResults: [QualifyingResultRow]?
}

struct PickResponse: Codable, Sendable {
    let pick: Pick
}
