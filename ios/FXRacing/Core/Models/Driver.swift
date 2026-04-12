import SwiftUI

struct Driver: Codable, Sendable, Identifiable {
    let id: String
    let code: String
    let firstName: String
    let lastName: String
    let number: Int
    let photoUrl: String?
    let seatKey: String?
    let constructor: DriverConstructor

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
