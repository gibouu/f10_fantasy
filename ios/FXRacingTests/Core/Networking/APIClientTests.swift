import Foundation
import XCTest
@testable import FXRacing

final class APIClientTests: XCTestCase {
    func testInjectedSessionsKeepConcurrentResponsesIsolated() async {
        let unauthorizedSession = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 401,
                body: #"{"error":"expired"}"#
            )
        )
        let notFoundSession = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 404,
                body: #"{"error":"missing"}"#
            )
        )
        let unauthorizedClient = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: unauthorizedSession
        )
        let notFoundClient = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: notFoundSession
        )

        async let unauthorizedError = observedError(from: unauthorizedClient)
        async let notFoundError = observedError(from: notFoundClient)
        let (firstError, secondError) = await (unauthorizedError, notFoundError)

        XCTAssertEqual(firstError, .unauthorized)
        XCTAssertEqual(secondError, .notFound)
    }

    func testInjectedSessionNormalizesNotFound() async {
        let session = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 404,
                body: #"{"error":"missing"}"#
            )
        )
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: session
        )

        do {
            let _: PickResponse = try await client.request(
                .pickForRace(raceId: "race"),
                token: "token"
            )
            XCTFail("Expected notFound")
        } catch APIError.notFound {
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testInjectedSessionNormalizesUnauthorized() async {
        let session = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 401,
                body: #"{"error":"expired"}"#
            )
        )
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: session
        )

        do {
            let _: PickResponse = try await client.request(
                .pickForRace(raceId: "race"),
                token: "token"
            )
            XCTFail("Expected unauthorized")
        } catch APIError.unauthorized {
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testInjectedSessionDecodesSharedRaceListPayload() async throws {
        let session = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 200,
                body: #"{"races":[],"season":{"id":"season-2026","year":2026}}"#
            )
        )
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: session
        )

        let payload: RaceListPayload = try await client.request(.races)

        XCTAssertTrue(payload.races.isEmpty)
        XCTAssertEqual(payload.season?.id, "season-2026")
        XCTAssertEqual(payload.season?.year, 2026)
    }

    func testInjectedSessionDecodesSharedRaceDetailPayload() async throws {
        let session = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 200,
                body: #"{"race":{"id":"race","seasonId":"season-2026","round":1,"name":"Race","circuitName":"Circuit","country":"Belgium","type":"MAIN","scheduledStartUtc":"2027-01-15T08:00:00Z","lockCutoffUtc":"2027-01-15T07:58:00Z","status":"UPCOMING","qualifyingStartUtc":null},"entrants":[{"id":"driver-with-form","code":"DRV","firstName":"Form","lastName":"Driver","number":1,"photoUrl":null,"seatKey":"team:1","seasonAverageFinish":4.5,"seasonDnfCount":3,"seasonResults":[{"raceId":"prior-race","raceName":"Prior Race","scheduledStartUtc":"2027-01-08T08:00:00Z","position":8,"status":"CLASSIFIED"}],"constructor":{"id":"team","name":"Team","shortName":"TEM","color":"FF0000","slug":"team","logoUrl":null}},{"id":"legacy-driver","code":"OLD","firstName":"Legacy","lastName":"Driver","number":2,"photoUrl":null,"seatKey":"team:2","constructor":{"id":"team","name":"Team","shortName":"TEM","color":"FF0000","slug":"team","logoUrl":null}}],"results":[],"qualifyingResults":[]}"#
            )
        )
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: session
        )

        let payload: RaceDetailPayload = try await client.request(.raceDetail(id: "race"))

        XCTAssertEqual(payload.race.id, "race")
        XCTAssertEqual(payload.entrants.count, 2)
        XCTAssertEqual(payload.entrants[0].seasonAverageFinish, 4.5)
        XCTAssertEqual(payload.entrants[0].seasonDnfCount, 3)
        XCTAssertEqual(payload.entrants[0].seasonResults?.map(\.raceId), ["prior-race"])
        XCTAssertEqual(payload.entrants[0].seasonResults?.first?.resultLabel, "P8")
        XCTAssertNil(payload.entrants[1].seasonAverageFinish)
        XCTAssertNil(payload.entrants[1].seasonDnfCount)
        XCTAssertNil(payload.entrants[1].seasonResults)
        XCTAssertTrue(payload.results.isEmpty)
        XCTAssertEqual(payload.qualifyingResults?.count, 0)
    }

    func testWorstCaseRaceDetailFixtureDecodesWithinResponseBudget() throws {
        let fixtureURL = try XCTUnwrap(
            Bundle(for: Self.self).url(
                forResource: "race-detail-22x24",
                withExtension: "json"
            )
        )
        let data = try Data(contentsOf: fixtureURL)

        let payload = try JSONDecoder.api().decode(RaceDetailPayload.self, from: data)

        XCTAssertEqual(payload.entrants.count, 22)
        XCTAssertTrue(payload.entrants.allSatisfy { $0.seasonResults?.count == 24 })
        XCTAssertLessThanOrEqual(data.count, 131_072)
    }

    func testInjectedSessionDecodesSharedPickResponse() async throws {
        let session = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 200,
                body: #"{"pick":{"id":"pick","raceId":"race","tenthPlaceDriverId":"p10","winnerDriverId":"winner","dnfDriverId":"dnf","version":"2026-07-24T18:33:00.000Z","lockedAt":null,"scoreBreakdown":null}}"#
            )
        )
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: session
        )

        let payload: PickResponse = try await client.request(
            .pickForRace(raceId: "race"),
            token: "token"
        )

        XCTAssertEqual(payload.pick.id, "pick")
        XCTAssertEqual(payload.pick.raceId, "race")
        XCTAssertEqual(payload.pick.version, "2026-07-24T18:33:00.000Z")
    }
}

private enum ObservedAPIError: Equatable, Sendable {
    case unauthorized
    case notFound
    case missing
    case unexpected(String)
}

private func observedError(from client: APIClient) async -> ObservedAPIError {
    do {
        let _: PickResponse = try await client.request(
            .pickForRace(raceId: "race"),
            token: "token"
        )
        return .missing
    } catch APIError.unauthorized {
        return .unauthorized
    } catch APIError.notFound {
        return .notFound
    } catch {
        return .unexpected(String(describing: error))
    }
}

private final class StubURLProtocol: URLProtocol {
    private static let statusHeader = "X-FXRacing-Test-Status"
    private static let bodyHeader = "X-FXRacing-Test-Body"

    static func configuration(status: Int, body: String) -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        configuration.httpAdditionalHeaders = [
            statusHeader: String(status),
            bodyHeader: Data(body.utf8).base64EncodedString(),
        ]
        return configuration
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard
            let statusValue = request.value(forHTTPHeaderField: Self.statusHeader),
            let status = Int(statusValue),
            let encodedBody = request.value(forHTTPHeaderField: Self.bodyHeader),
            let body = Data(base64Encoded: encodedBody)
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: nil,
            headerFields: nil
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
