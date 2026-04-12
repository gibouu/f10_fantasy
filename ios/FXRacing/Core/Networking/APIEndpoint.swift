import Foundation

struct APIEndpoint: Sendable {
    let method: String
    let path: String
    let queryItems: [URLQueryItem]
    let bodyData: Data?

    init(
        method: String,
        path: String,
        queryItems: [URLQueryItem] = [],
        bodyData: Data? = nil
    ) {
        self.method = method
        self.path = path
        self.queryItems = queryItems
        self.bodyData = bodyData
    }
}

// MARK: - Endpoint catalogue

extension APIEndpoint {

    // Auth
    static func mobileExchange(provider: String, idToken: String) -> APIEndpoint {
        let body = try? JSONEncoder().encode(["provider": provider, "idToken": idToken])
        return APIEndpoint(method: "POST", path: "/api/auth/mobile/exchange", bodyData: body)
    }

    // User
    static let me = APIEndpoint(method: "GET", path: "/api/users/me")

    static let suggestUsernames = APIEndpoint(method: "GET", path: "/api/users/suggest-usernames")

    static func checkUsername(_ username: String) -> APIEndpoint {
        APIEndpoint(
            method: "GET",
            path: "/api/users/username",
            queryItems: [URLQueryItem(name: "username", value: username)]
        )
    }

    static func setUsername(_ username: String) -> APIEndpoint {
        let body = try? JSONEncoder().encode(["username": username])
        return APIEndpoint(method: "POST", path: "/api/users/username", bodyData: body)
    }

    static func changeUsername(_ username: String) -> APIEndpoint {
        let body = try? JSONEncoder().encode(["username": username])
        return APIEndpoint(method: "PATCH", path: "/api/users/username", bodyData: body)
    }

    static func setFavoriteTeam(_ slug: String?) -> APIEndpoint {
        let body = try? JSONEncoder().encode(["slug": slug])
        return APIEndpoint(method: "PATCH", path: "/api/users/team", bodyData: body)
    }

    // Races (Phase 2)
    static let races = APIEndpoint(method: "GET", path: "/api/races")

    static func raceDetail(id: String) -> APIEndpoint {
        APIEndpoint(method: "GET", path: "/api/races/\(id)")
    }

    static func pickForRace(raceId: String) -> APIEndpoint {
        APIEndpoint(
            method: "GET",
            path: "/api/picks",
            queryItems: [URLQueryItem(name: "raceId", value: raceId)]
        )
    }

    static func submitPick(raceId: String, tenthPlaceDriverId: String, winnerDriverId: String, dnfDriverId: String) -> APIEndpoint {
        let body = try? JSONEncoder().encode([
            "raceId": raceId,
            "tenthPlaceDriverId": tenthPlaceDriverId,
            "winnerDriverId": winnerDriverId,
            "dnfDriverId": dnfDriverId,
        ])
        return APIEndpoint(method: "POST", path: "/api/picks", bodyData: body)
    }

    // Leaderboard (Phase 3)
    static func leaderboard(scope: String, sort: String) -> APIEndpoint {
        APIEndpoint(
            method: "GET",
            path: "/api/leaderboard",
            queryItems: [
                URLQueryItem(name: "scope", value: scope),
                URLQueryItem(name: "sort", value: sort),
            ]
        )
    }

    // Friends (Phase 3)
    static let friends = APIEndpoint(method: "GET", path: "/api/friends")

    static func searchUsers(_ query: String) -> APIEndpoint {
        APIEndpoint(
            method: "GET",
            path: "/api/friends",
            queryItems: [URLQueryItem(name: "q", value: query)]
        )
    }

    static func sendFriendRequest(addresseeId: String) -> APIEndpoint {
        let body = try? JSONEncoder().encode(["addresseeId": addresseeId])
        return APIEndpoint(method: "POST", path: "/api/friends", bodyData: body)
    }

    static func respondToFriendRequest(id: String, action: String) -> APIEndpoint {
        let body = try? JSONEncoder().encode(["action": action])
        return APIEndpoint(method: "PATCH", path: "/api/friends/\(id)", bodyData: body)
    }

    static func userProfile(userId: String) -> APIEndpoint {
        APIEndpoint(method: "GET", path: "/api/users/\(userId)")
    }
}
