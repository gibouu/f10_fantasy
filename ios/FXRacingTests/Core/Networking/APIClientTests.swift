import Foundation
import XCTest
@testable import FXRacing

final class APIClientTests: XCTestCase {
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
                body: #"{"race":{"id":"race","seasonId":"season-2026","round":1,"name":"Race","circuitName":"Circuit","country":"Belgium","type":"MAIN","scheduledStartUtc":"2027-01-15T08:00:00Z","lockCutoffUtc":"2027-01-15T07:58:00Z","status":"UPCOMING","qualifyingStartUtc":null},"entrants":[],"results":[],"qualifyingResults":[]}"#
            )
        )
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: session
        )

        let payload: RaceDetailPayload = try await client.request(.raceDetail(id: "race"))

        XCTAssertEqual(payload.race.id, "race")
        XCTAssertTrue(payload.entrants.isEmpty)
        XCTAssertTrue(payload.results.isEmpty)
        XCTAssertEqual(payload.qualifyingResults?.count, 0)
    }

    func testInjectedSessionDecodesSharedPickResponse() async throws {
        let session = URLSession(
            configuration: StubURLProtocol.configuration(
                status: 200,
                body: #"{"pick":{"id":"pick","raceId":"race","tenthPlaceDriverId":"p10","winnerDriverId":"winner","dnfDriverId":"dnf","lockedAt":null,"scoreBreakdown":null}}"#
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
    }
}

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var body = Data()

    static func configuration(status: Int, body: String) -> URLSessionConfiguration {
        Self.status = status
        Self.body = Data(body.utf8)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return configuration
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: Self.status,
            httpVersion: nil,
            headerFields: nil
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
