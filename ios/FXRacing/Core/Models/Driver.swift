import SwiftUI

struct Driver: Codable, Sendable, Identifiable {
    let id: String
    let code: String
    let firstName: String
    let lastName: String
    let number: Int
    let photoUrl: String?
    let seatKey: String?
    let seasonAverageFinish: Double?
    let seasonDnfCount: Int?
    let seasonResults: [DriverSeasonResult]?
    let constructor: DriverConstructor

    init(
        id: String,
        code: String,
        firstName: String,
        lastName: String,
        number: Int,
        photoUrl: String?,
        seatKey: String?,
        seasonAverageFinish: Double? = nil,
        seasonDnfCount: Int? = nil,
        seasonResults: [DriverSeasonResult]? = nil,
        constructor: DriverConstructor
    ) {
        self.id = id
        self.code = code
        self.firstName = firstName
        self.lastName = lastName
        self.number = number
        self.photoUrl = photoUrl
        self.seatKey = seatKey
        self.seasonAverageFinish = seasonAverageFinish
        self.seasonDnfCount = seasonDnfCount
        self.seasonResults = seasonResults
        self.constructor = constructor
    }

    /// Full URL to driver headshot. Relative paths are resolved against the API base URL;
    /// absolute URLs (e.g. from external CDNs) are used as-is.
    var photoFullURL: URL? {
        guard let path = photoUrl else { return nil }
        if path.hasPrefix("http") { return URL(string: path) }
        return URL(string: Config.apiBaseURL.absoluteString + path)
    }

    var teamColor: Color {
        Color(hex: constructor.color) ?? .gray
    }
}

struct DriverSeasonResult: Codable, Sendable, Identifiable, Equatable {
    let raceId: String
    let raceName: String
    let scheduledStartUtc: Date
    let position: Int?
    let status: ResultStatus

    var id: String { raceId }

    var resultLabel: String {
        switch status {
        case .classified: position.map { "P\($0)" } ?? "—"
        case .dnf: "DNF"
        case .dns: "DNS"
        case .dsq: "DSQ"
        }
    }
}

struct DriverConstructor: Codable, Sendable {
    let id: String
    let name: String
    let shortName: String
    let color: String
    let slug: String?
    let logoUrl: String?

    var logoFullURL: URL? {
        guard let path = logoUrl else { return nil }
        if path.hasPrefix("http") { return URL(string: path) }
        return URL(string: Config.apiBaseURL.absoluteString + path)
    }

    var teamColor: Color {
        Color(hex: color) ?? .gray
    }
}
