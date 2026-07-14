#if FX_PERF_HARNESS
import Foundation

enum PerformanceFixtureScenario: String, Sendable {
    case authChecking = "auth-checking"
    case accountUnavailable = "account-unavailable"
    case empty = "empty"
    case cached = "cached"
    case cachePrime = "cache-prime"
    case cachedLaunch = "cached-launch"
    case offline = "offline"
    case image = "image"
    case gameplay = "gameplay"
}

enum PerformanceFixtures {
    static let now = Date(timeIntervalSince1970: 1_800_000_000)
    static let season = Season(id: "season-2026", year: 2026)

    static let mercedes = DriverConstructor(
        id: "mercedes",
        name: "Mercedes",
        shortName: "MER",
        color: "00D2BE",
        slug: "mercedes",
        logoUrl: nil
    )
    static let ferrari = DriverConstructor(
        id: "ferrari",
        name: "Ferrari",
        shortName: "FER",
        color: "E80020",
        slug: "ferrari",
        logoUrl: nil
    )
    static let mclaren = DriverConstructor(
        id: "mclaren",
        name: "McLaren",
        shortName: "MCL",
        color: "FF8700",
        slug: "mclaren",
        logoUrl: nil
    )
    static let drivers = [
        Driver(
            id: "antonelli",
            code: "ANT",
            firstName: "Kimi",
            lastName: "Antonelli",
            number: 12,
            photoUrl: nil,
            seatKey: "mercedes-2",
            constructor: mercedes
        ),
        Driver(
            id: "russell",
            code: "RUS",
            firstName: "George",
            lastName: "Russell",
            number: 63,
            photoUrl: nil,
            seatKey: "mercedes-1",
            constructor: mercedes
        ),
        Driver(
            id: "hamilton",
            code: "HAM",
            firstName: "Lewis",
            lastName: "Hamilton",
            number: 44,
            photoUrl: nil,
            seatKey: "ferrari-1",
            constructor: ferrari
        ),
        Driver(
            id: "leclerc",
            code: "LEC",
            firstName: "Charles",
            lastName: "Leclerc",
            number: 16,
            photoUrl: nil,
            seatKey: "ferrari-2",
            constructor: ferrari
        ),
        Driver(
            id: "norris",
            code: "NOR",
            firstName: "Lando",
            lastName: "Norris",
            number: 4,
            photoUrl: nil,
            seatKey: "mclaren-1",
            constructor: mclaren
        ),
    ]

    static let liveSpa = race(
        id: "spa",
        round: 13,
        name: "Belgian Grand Prix",
        circuit: "Circuit de Spa-Francorchamps",
        country: "Belgium",
        status: .live,
        startOffset: 3_600
    )
    static let upcomingMonza = race(
        id: "monza",
        round: 14,
        name: "Italian Grand Prix",
        circuit: "Autodromo Nazionale Monza",
        country: "Italy",
        status: .upcoming,
        startOffset: 172_800
    )
    static let completedSilverstone = race(
        id: "silverstone",
        round: 12,
        name: "British Grand Prix",
        circuit: "Silverstone Circuit",
        country: "United Kingdom",
        status: .completed,
        startOffset: -86_400
    )

    static let list = RaceListSnapshot(
        schemaVersion: RaceListSnapshot.currentSchemaVersion,
        savedAt: now,
        season: season,
        races: [liveSpa, upcomingMonza, completedSilverstone]
    )

    static func detail(
        for race: Race,
        usesFixtureImages: Bool = false
    ) -> RaceDetailSnapshot {
        let isCompleted = race.status == .completed
        return RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: now,
            race: race,
            entrants: usesFixtureImages ? driversWithFixtureImages : drivers,
            results: isCompleted ? completedResults : [],
            qualifyingResults: isCompleted ? completedQualifying : []
        )
    }

    static let driversWithFixtureImages = drivers.map { driver in
        let constructor = DriverConstructor(
            id: driver.constructor.id,
            name: driver.constructor.name,
            shortName: driver.constructor.shortName,
            color: driver.constructor.color,
            slug: driver.constructor.slug,
            logoUrl: "https://fixture.invalid/teams/\(driver.constructor.id).png"
        )
        return Driver(
            id: driver.id,
            code: driver.code,
            firstName: driver.firstName,
            lastName: driver.lastName,
            number: driver.number,
            photoUrl: "https://fixture.invalid/drivers/\(driver.id).png",
            seatKey: driver.seatKey,
            constructor: constructor
        )
    }

    static let completedResults = [
        RaceResult(
            driverId: "antonelli",
            position: 1,
            status: .classified,
            fastestLap: false,
            scoreGuide: ResultScoreGuide(p10: 0, winner: 5, dnf: 0)
        ),
        RaceResult(
            driverId: "russell",
            position: 2,
            status: .classified,
            fastestLap: true,
            scoreGuide: ResultScoreGuide(p10: 0, winner: 0, dnf: 0)
        ),
        RaceResult(
            driverId: "hamilton",
            position: 10,
            status: .classified,
            fastestLap: false,
            scoreGuide: ResultScoreGuide(p10: 25, winner: 0, dnf: 0)
        ),
        RaceResult(
            driverId: "norris",
            position: 11,
            status: .classified,
            fastestLap: false,
            scoreGuide: ResultScoreGuide(p10: 18, winner: 0, dnf: 0)
        ),
        RaceResult(
            driverId: "leclerc",
            position: nil,
            status: .dnf,
            fastestLap: false,
            scoreGuide: ResultScoreGuide(p10: 0, winner: 0, dnf: 3)
        ),
    ]

    static let completedQualifying = [
        QualifyingResultRow(driverId: "russell", position: 1),
        QualifyingResultRow(driverId: "antonelli", position: 2),
        QualifyingResultRow(driverId: "hamilton", position: 3),
        QualifyingResultRow(driverId: "norris", position: 4),
        QualifyingResultRow(driverId: "leclerc", position: 5),
    ]

    static let scoredPick = Pick(
        id: "fixture-scored-pick",
        raceId: completedSilverstone.id,
        tenthPlaceDriverId: "hamilton",
        winnerDriverId: "antonelli",
        dnfDriverId: "leclerc",
        lockedAt: completedSilverstone.lockCutoffUtc,
        scoreBreakdown: ScoreBreakdown(
            tenthPlaceScore: 25,
            winnerBonus: 5,
            dnfBonus: 3,
            earlyBirdBonus: 33,
            totalScore: 66
        )
    )

    static let user = User(
        id: "fixture-player",
        name: "Apex Pilot",
        email: nil,
        avatarUrl: nil,
        publicUsername: "ApexPilot",
        usernameSet: true,
        usernameChangeUsed: false,
        favoriteTeamSlug: "mercedes",
        tutorialDismissedAt: now,
        createdAt: now.addingTimeInterval(-86_400)
    )

    static let leaderboardData = Data(
        #"{"rows":[{"rank":1,"userId":"fixture-player","publicUsername":"ApexPilot","avatarUrl":null,"teamLogoUrl":null,"teamColor":"FF2D2D","totalScore":179,"exactTenthHits":5,"winnerHits":3,"dnfHits":2}],"userRank":null,"userRow":null}"#.utf8
    )

    private static func race(
        id: String,
        round: Int,
        name: String,
        circuit: String,
        country: String,
        status: RaceStatus,
        startOffset: TimeInterval
    ) -> Race {
        let start = now.addingTimeInterval(startOffset)
        return Race(
            id: id,
            seasonId: season.id,
            round: round,
            name: name,
            circuitName: circuit,
            country: country,
            type: .main,
            scheduledStartUtc: start,
            lockCutoffUtc: start.addingTimeInterval(-120),
            status: status,
            qualifyingStartUtc: start.addingTimeInterval(-86_400)
        )
    }
}

struct PerformanceClock: ClockProviding {
    let date: Date

    init(date: Date = PerformanceFixtures.now) {
        self.date = date
    }

    func now() -> Date { date }
}

actor PerformanceRaceRepository: RaceRepositoryProtocol {
    private let snapshot: RaceListSnapshot
    private let scenario: PerformanceFixtureScenario

    init(
        scenario: PerformanceFixtureScenario,
        snapshot: RaceListSnapshot = PerformanceFixtures.list
    ) {
        self.scenario = scenario
        self.snapshot = snapshot
    }

    func cachedList() async -> RaceListSnapshot? {
        scenario == .empty ? nil : snapshot
    }

    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot {
        if scenario == .offline {
            throw APIError.networkFailed(URLError(.notConnectedToInternet))
        }
        return snapshot
    }

    func cachedDetail(id: String) async -> RaceDetailSnapshot? {
        guard let race = snapshot.races.first(where: { $0.id == id }) else {
            return nil
        }
        return PerformanceFixtures.detail(
            for: race,
            usesFixtureImages: scenario == .image
        )
    }

    func refreshDetail(
        id: String,
        policy: RaceFetchPolicy
    ) async throws -> RaceDetailSnapshot {
        guard let detail = await cachedDetail(id: id) else {
            throw APIError.notFound
        }
        return detail
    }

    func prefetchDetail(ids: [String]) async {}
}

struct PerformanceAPIClient: APIRequesting {
    let scenario: PerformanceFixtureScenario

    func request<T: Decodable & Sendable>(
        _ endpoint: APIEndpoint,
        token: String?
    ) async throws -> T {
        switch endpoint.path {
        case APIEndpoint.me.path:
            switch scenario {
            case .authChecking:
                try await Task.sleep(for: .seconds(3_600))
                throw CancellationError()
            case .accountUnavailable:
                throw APIError.networkFailed(URLError(.notConnectedToInternet))
            case .gameplay:
                return try encoded(PerformanceFixtures.user)
            case .empty, .cached, .cachePrime, .cachedLaunch, .offline, .image:
                throw APIError.unauthorized
            }

        case APIEndpoint.races.path:
            guard scenario == .cachePrime else {
                throw APIError.networkFailed(URLError(.notConnectedToInternet))
            }
            return try encoded(
                RaceListPayload(
                    races: PerformanceFixtures.list.races,
                    season: PerformanceFixtures.list.season
                )
            )

        case let path where path.hasPrefix("/api/races/"):
            guard scenario == .cachePrime,
                  let raceID = path.split(separator: "/").last.map(String.init),
                  let race = PerformanceFixtures.list.races.first(where: { $0.id == raceID })
            else {
                throw APIError.networkFailed(URLError(.notConnectedToInternet))
            }
            let detail = PerformanceFixtures.detail(for: race)
            return try encoded(
                RaceDetailPayload(
                    race: detail.race,
                    entrants: detail.entrants,
                    results: detail.results,
                    qualifyingResults: detail.qualifyingResults
                )
            )

        case "/api/leaderboard":
            return try JSONDecoder.api().decode(T.self, from: PerformanceFixtures.leaderboardData)

        case "/api/picks":
            if endpoint.method == "GET",
               endpoint.queryItems.first(where: { $0.name == "raceId" })?.value
                    == PerformanceFixtures.completedSilverstone.id {
                return try encoded(
                    PickResponse(pick: PerformanceFixtures.scoredPick)
                )
            }
            if endpoint.method == "POST",
               let bodyData = endpoint.bodyData,
               let body = try? JSONDecoder().decode(
                    PerformancePickSubmission.self,
                    from: bodyData
               ) {
                return try encoded(
                    PickResponse(
                        pick: Pick(
                            id: "fixture-saved-pick-\(body.raceId)",
                            raceId: body.raceId,
                            tenthPlaceDriverId: body.tenthPlaceDriverId,
                            winnerDriverId: body.winnerDriverId,
                            dnfDriverId: body.dnfDriverId,
                            lockedAt: nil,
                            scoreBreakdown: nil
                        )
                    )
                )
            }
            throw APIError.notFound

        default:
            throw APIError.networkFailed(URLError(.notConnectedToInternet))
        }
    }

    private func encoded<T: Encodable, Result: Decodable>(
        _ value: T
    ) throws -> Result {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(value)
        return try JSONDecoder.api().decode(Result.self, from: data)
    }
}

struct PerformanceImageDataLoader: ImageDataLoading {
    private static let onePixelPNG = Data(
        base64Encoded:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )!

    func data(for url: URL) async throws -> Data {
        guard url.host == "fixture.invalid" else {
            throw URLError(.notConnectedToInternet)
        }
        return Self.onePixelPNG
    }
}

enum PerformanceFixtureState {
    @MainActor
    static func makeLocalPickStore(
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> LocalPickStore {
        guard arguments.contains("--performance-scenario") else {
            return LocalPickStore()
        }

        reset()
        return LocalPickStore(clock: PerformanceClock())
    }

    @MainActor
    static func makeTutorialStore(
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> TutorialStore {
        let store = TutorialStore()
        guard arguments.contains("--performance-scenario") else { return store }

        store.markAllSeen()
        return store
    }

    private static func reset() {
        guard let bundleIdentifier = Bundle.main.bundleIdentifier else { return }
        UserDefaults.standard.removePersistentDomain(forName: bundleIdentifier)
    }
}

private struct PerformancePickSubmission: Decodable {
    let raceId: String
    let tenthPlaceDriverId: String
    let winnerDriverId: String
    let dnfDriverId: String
}

@MainActor
final class PerformanceTokenStore: TokenStoring {
    private var token: String?

    init(token: String?) {
        self.token = token
    }

    func loadToken() -> String? { token }

    func saveToken(_ token: String) throws {
        self.token = token
    }

    func deleteToken() {
        token = nil
    }
}
#endif
