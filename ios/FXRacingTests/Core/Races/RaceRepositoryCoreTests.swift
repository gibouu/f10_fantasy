import Foundation
import XCTest
@testable import FXRacing

final class RaceRepositoryCoreTests: XCTestCase {
    func testCachedListLoadsDiskOnceThenReturnsPublishedMemory() async throws {
        let disk = makeList(savedAt: RaceFixtures.now, races: [RaceFixtures.upcoming])
        let cache = MemoryRaceSnapshotCache(list: disk)
        let repository = RaceRepository(
            api: APIClientSpy(responses: [:]),
            cache: cache,
            clock: TestClock.fixed
        )
        let _: any RaceRepositoryProtocol = repository

        let first = await repository.cachedList()
        await cache.setList(nil)
        let second = await repository.cachedList()
        let readCount = await cache.listReadCount

        XCTAssertEqual(first?.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(second?.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(readCount, 1)
    }

    func testIfStaleListUsesExactSixtySecondBoundary() async throws {
        let cases: [(age: TimeInterval, expectedCalls: Int, expectedRaceID: String)] = [
            (59, 0, RaceFixtures.upcoming.id),
            (60, 1, RaceFixtures.liveSpa.id),
        ]

        for testCase in cases {
            let cached = makeList(
                savedAt: RaceFixtures.now.addingTimeInterval(-testCase.age),
                races: [RaceFixtures.upcoming]
            )
            let api = APIClientSpy(
                responses: [
                    "GET /api/races": .json(
                        RaceListPayload(
                            races: [RaceFixtures.liveSpa],
                            season: RaceFixtures.season2026
                        )
                    ),
                ]
            )
            let repository = RaceRepository(
                api: api,
                cache: MemoryRaceSnapshotCache(list: cached),
                clock: TestClock.fixed
            )

            let snapshot = try await repository.refreshList(policy: .ifStale)
            let callCount = await api.totalCallCount

            XCTAssertEqual(callCount, testCase.expectedCalls, "age: \(testCase.age)")
            XCTAssertEqual(snapshot.races.map(\.id), [testCase.expectedRaceID], "age: \(testCase.age)")
        }
    }

    func testConcurrentForcedListRefreshesJoinOneAnonymousRequestAndPublishBeforeReturning() async throws {
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .json(
                        RaceListPayload(
                            races: [RaceFixtures.upcoming],
                            season: RaceFixtures.season2026
                        )
                    ),
                ],
            ],
            gatedKeys: ["GET /api/races"]
        )
        let events = RepositoryEventProbe()
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed,
            onEvent: { event in await events.record(event) }
        )

        let first = Task { try await repository.refreshList(policy: .force) }
        await api.waitForCalls(to: "/api/races", count: 1)
        let second = Task { try await repository.refreshList(policy: .force) }
        await events.waitForListJoins(count: 1)
        await api.releaseRequests(to: "/api/races")

        let snapshots = try await (first.value, second.value)
        let published = await repository.cachedList()
        let requests = await api.recordedRequests()

        XCTAssertEqual(snapshots.0.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(snapshots.1.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(published?.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(requests.count, 1)
        XCTAssertTrue(requests.allSatisfy { $0.token == nil })
    }

    func testFailedListFlightClearsSoNextForcedRefreshRetries() async throws {
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .failure(.serverError(503, nil)),
                    .json(
                        RaceListPayload(
                            races: [RaceFixtures.upcoming],
                            season: RaceFixtures.season2026
                        )
                    ),
                ],
            ]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )

        do {
            _ = try await repository.refreshList(policy: .force)
            XCTFail("Expected the first refresh to fail")
        } catch {
            // The failed in-flight task must not remain registered.
        }

        let snapshot = try await repository.refreshList(policy: .force)
        let callCount = await api.calls(to: "/api/races")

        XCTAssertEqual(snapshot.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(callCount, 2)
    }

    func testForegroundListUsesExactThirtySecondBoundary() async throws {
        let cases: [(age: TimeInterval, expectedCalls: Int)] = [
            (29, 0),
            (30, 1),
        ]

        for testCase in cases {
            let cached = makeList(
                savedAt: RaceFixtures.now.addingTimeInterval(-testCase.age),
                races: [RaceFixtures.upcoming]
            )
            let api = APIClientSpy(
                responses: [
                    "GET /api/races": .json(
                        RaceListPayload(
                            races: [RaceFixtures.liveSpa],
                            season: RaceFixtures.season2026
                        )
                    ),
                ]
            )
            let repository = RaceRepository(
                api: api,
                cache: MemoryRaceSnapshotCache(list: cached),
                clock: TestClock.fixed
            )

            _ = try await repository.refreshList(policy: .foreground)
            let callCount = await api.totalCallCount

            XCTAssertEqual(callCount, testCase.expectedCalls, "age: \(testCase.age)")
        }
    }

    func testListCacheReadAndWriteFailuresDoNotBlockNetworkPublication() async throws {
        let cache = MemoryRaceSnapshotCache(
            failListReads: true,
            failListWrites: true
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .json(
                        RaceListPayload(
                            races: [RaceFixtures.upcoming],
                            season: RaceFixtures.season2026
                        )
                    ),
                ],
            ]
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)

        let refreshed = try await repository.refreshList(policy: .ifStale)
        let published = await repository.cachedList()
        let requests = await api.recordedRequests()
        let readCount = await cache.listReadCount
        let writeCount = await cache.listWriteCount

        XCTAssertEqual(refreshed.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(published?.races.map(\.id), [RaceFixtures.upcoming.id])
        XCTAssertEqual(requests.count, 1)
        XCTAssertTrue(requests.allSatisfy { $0.token == nil })
        XCTAssertEqual(readCount, 1)
        XCTAssertEqual(writeCount, 1)
    }

    func testListRefreshRechecksFlightAfterSuspendedDiskReads() async throws {
        let cache = MemoryRaceSnapshotCache(gatesListReads: true)
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .json(
                        RaceListPayload(
                            races: [RaceFixtures.upcoming],
                            season: RaceFixtures.season2026
                        )
                    ),
                ],
            ],
            gatedKeys: ["GET /api/races"]
        )
        let events = RepositoryEventProbe()
        let repository = RaceRepository(
            api: api,
            cache: cache,
            clock: TestClock.fixed,
            onEvent: { event in await events.record(event) }
        )

        let first = Task { try await repository.refreshList(policy: .ifStale) }
        await cache.waitForListReads(count: 1)
        let second = Task { try await repository.refreshList(policy: .ifStale) }
        await cache.waitForListReads(count: 2)
        await cache.releaseListReads()
        await api.waitForCalls(to: "/api/races", count: 1)
        await events.waitForListJoins(count: 1)
        await api.releaseRequests(to: "/api/races")

        _ = try await (first.value, second.value)
        let callCount = await api.calls(to: "/api/races")

        XCTAssertEqual(callCount, 1)
    }

    func testSuccessfulListFlightClearsSoNextForceStartsAnotherRequest() async throws {
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .json(RaceListPayload(races: [RaceFixtures.upcoming], season: RaceFixtures.season2026)),
                    .json(RaceListPayload(races: [RaceFixtures.liveSpa], season: RaceFixtures.season2026)),
                ],
            ]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )

        _ = try await repository.refreshList(policy: .force)
        let second = try await repository.refreshList(policy: .force)
        let callCount = await api.calls(to: "/api/races")

        XCTAssertEqual(second.races.map(\.id), [RaceFixtures.liveSpa.id])
        XCTAssertEqual(callCount, 2)
    }

    func testCachedDetailLoadsDiskOnceThenReturnsPublishedMemory() async throws {
        let detail = makeDetail(
            savedAt: RaceFixtures.now,
            race: RaceFixtures.upcoming,
            entrants: [DriverFixtures.norris]
        )
        let cache = MemoryRaceSnapshotCache(details: [detail.race.id: detail])
        let repository = RaceRepository(
            api: APIClientSpy(responses: [:]),
            cache: cache,
            clock: TestClock.fixed
        )

        let first = await repository.cachedDetail(id: detail.race.id)
        await cache.setDetail(nil, id: detail.race.id)
        let second = await repository.cachedDetail(id: detail.race.id)
        let readCount = await cache.detailReadCounts[detail.race.id, default: 0]

        XCTAssertEqual(first?.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(second?.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(readCount, 1)
    }

    func testDetailUsesExactStatusSpecificFreshnessBoundaries() async throws {
        let cases: [(status: RaceStatus, age: TimeInterval, expectedCalls: Int)] = [
            (.upcoming, 299, 0),
            (.upcoming, 300, 1),
            (.live, 59, 0),
            (.live, 60, 1),
            (.completed, 21_599, 0),
            (.completed, 21_600, 1),
            (.cancelled, 21_599, 0),
            (.cancelled, 21_600, 1),
        ]

        for (index, testCase) in cases.enumerated() {
            let race = RaceFixtures.race(
                id: "detail-boundary-\(index)",
                round: index + 1,
                status: testCase.status,
                startOffset: 3_600
            )
            let cached = makeDetail(
                savedAt: RaceFixtures.now.addingTimeInterval(-testCase.age),
                race: race,
                entrants: [DriverFixtures.norris]
            )
            let api = APIClientSpy(
                responses: [
                    "GET /api/races/\(race.id)": .json(
                        makeDetailPayload(race: race, entrants: [DriverFixtures.piastri])
                    ),
                ]
            )
            let repository = RaceRepository(
                api: api,
                cache: MemoryRaceSnapshotCache(details: [race.id: cached]),
                clock: TestClock.fixed
            )

            let snapshot = try await repository.refreshDetail(id: race.id, policy: .ifStale)
            let callCount = await api.totalCallCount
            let expectedDriverID = testCase.expectedCalls == 0
                ? DriverFixtures.norris.id
                : DriverFixtures.piastri.id

            XCTAssertEqual(
                callCount,
                testCase.expectedCalls,
                "status: \(testCase.status), age: \(testCase.age)"
            )
            XCTAssertEqual(
                snapshot.entrants.map(\.id),
                [expectedDriverID],
                "status: \(testCase.status), age: \(testCase.age)"
            )
        }
    }

    func testCurrentListStatusOverridesCachedDetailStatusForFreshness() async throws {
        let cases: [(
            listStatus: RaceStatus,
            detailStatus: RaceStatus,
            expectedCalls: Int
        )] = [
            (.live, .completed, 1),
            (.completed, .live, 0),
        ]

        for (index, testCase) in cases.enumerated() {
            let id = "status-override-\(index)"
            let listRace = RaceFixtures.race(
                id: id,
                round: index + 1,
                status: testCase.listStatus,
                startOffset: 3_600
            )
            let detailRace = RaceFixtures.race(
                id: id,
                round: index + 1,
                status: testCase.detailStatus,
                startOffset: 3_600
            )
            let list = makeList(savedAt: RaceFixtures.now, races: [listRace])
            let detail = makeDetail(
                savedAt: RaceFixtures.now.addingTimeInterval(-60),
                race: detailRace,
                entrants: [DriverFixtures.norris]
            )
            let api = APIClientSpy(
                responses: [
                    "GET /api/races/\(id)": .json(
                        makeDetailPayload(race: listRace, entrants: [DriverFixtures.piastri])
                    ),
                ]
            )
            let repository = RaceRepository(
                api: api,
                cache: MemoryRaceSnapshotCache(list: list, details: [id: detail]),
                clock: TestClock.fixed
            )

            _ = try await repository.refreshDetail(id: id, policy: .ifStale)
            let callCount = await api.totalCallCount

            XCTAssertEqual(
                callCount,
                testCase.expectedCalls,
                "list: \(testCase.listStatus), detail: \(testCase.detailStatus)"
            )
        }
    }

    func testDetailRefreshUsesSameIDPublicationThatFinishesDuringListRead() async throws {
        let id = "detail-published-during-list-read"
        let race = RaceFixtures.race(
            id: id,
            round: 1,
            status: .completed,
            startOffset: -3_600
        )
        let cached = makeDetail(
            savedAt: RaceFixtures.now.addingTimeInterval(-60),
            race: race,
            entrants: [DriverFixtures.norris]
        )
        let cache = MemoryRaceSnapshotCache(
            list: makeList(savedAt: RaceFixtures.now, races: [race]),
            details: [id: cached],
            gatesListReads: true
        )
        let path = "/api/races/\(id)"
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(path)": [
                    .json(makeDetailPayload(race: race, entrants: [DriverFixtures.piastri])),
                ],
            ]
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)

        let waiting = Task {
            try await repository.refreshDetail(id: id, policy: .ifStale)
        }
        await cache.waitForListReads(count: 1)

        let forced = try await repository.refreshDetail(id: id, policy: .force)
        await cache.releaseListReads()
        let resumed = try await waiting.value
        let published = await repository.cachedDetail(id: id)
        let callCount = await api.calls(to: path)

        XCTAssertEqual(forced.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(resumed.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(published?.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(callCount, 1)
    }

    func testDetailCacheFailuresStillPublishNormalizedAnonymousNetworkPayload() async throws {
        let race = RaceFixtures.upcoming
        let cache = MemoryRaceSnapshotCache(
            failedDetailReads: [race.id],
            failedDetailWrites: [race.id]
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races/\(race.id)": [
                    .json(
                        RaceDetailPayload(
                            race: race,
                            entrants: [DriverFixtures.norris],
                            results: [],
                            qualifyingResults: nil
                        )
                    ),
                ],
            ]
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)

        let refreshed = try await repository.refreshDetail(id: race.id, policy: .ifStale)
        let published = await repository.cachedDetail(id: race.id)
        let requests = await api.recordedRequests()
        let readCount = await cache.detailReadCounts[race.id, default: 0]
        let writeCount = await cache.detailWriteCounts[race.id, default: 0]

        XCTAssertEqual(refreshed.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(refreshed.qualifyingResults.count, 0)
        XCTAssertEqual(published?.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(requests.count, 1)
        XCTAssertTrue(requests.allSatisfy { $0.token == nil })
        XCTAssertEqual(readCount, 1)
        XCTAssertEqual(writeCount, 1)
    }

    func testConcurrentForcedDetailRefreshesJoinOneRequestAndPublishBeforeReturning() async throws {
        let race = RaceFixtures.upcoming
        let path = "/api/races/\(race.id)"
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(path)": [
                    .json(makeDetailPayload(race: race, entrants: [DriverFixtures.norris])),
                ],
            ],
            gatedKeys: ["GET \(path)"]
        )
        let events = RepositoryEventProbe()
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed,
            onEvent: { event in await events.record(event) }
        )

        let first = Task { try await repository.refreshDetail(id: race.id, policy: .force) }
        await api.waitForCalls(to: path, count: 1)
        let second = Task { try await repository.refreshDetail(id: race.id, policy: .force) }
        await events.waitForDetailJoins(id: race.id, count: 1)
        await api.releaseRequests(to: path)

        let snapshots = try await (first.value, second.value)
        let published = await repository.cachedDetail(id: race.id)
        let callCount = await api.calls(to: path)

        XCTAssertEqual(snapshots.0.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(snapshots.1.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(published?.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(callCount, 1)
    }

    func testDetailRefreshRechecksFlightAfterSuspendedDiskReads() async throws {
        let race = RaceFixtures.upcoming
        let path = "/api/races/\(race.id)"
        let cache = MemoryRaceSnapshotCache(gatedDetailReads: [race.id])
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(path)": [
                    .json(makeDetailPayload(race: race, entrants: [DriverFixtures.norris])),
                ],
            ],
            gatedKeys: ["GET \(path)"]
        )
        let events = RepositoryEventProbe()
        let repository = RaceRepository(
            api: api,
            cache: cache,
            clock: TestClock.fixed,
            onEvent: { event in await events.record(event) }
        )

        let first = Task { try await repository.refreshDetail(id: race.id, policy: .ifStale) }
        await cache.waitForDetailReads(id: race.id, count: 1)
        let second = Task { try await repository.refreshDetail(id: race.id, policy: .ifStale) }
        await cache.waitForDetailReads(id: race.id, count: 2)
        await cache.releaseDetailReads(id: race.id)
        await api.waitForCalls(to: path, count: 1)
        await events.waitForDetailJoins(id: race.id, count: 1)
        await api.releaseRequests(to: path)

        _ = try await (first.value, second.value)
        let callCount = await api.calls(to: path)

        XCTAssertEqual(callCount, 1)
    }

    func testDifferentDetailIDsUseIndependentFlights() async throws {
        let firstRace = RaceFixtures.upcoming
        let secondRace = RaceFixtures.liveSpa
        let firstPath = "/api/races/\(firstRace.id)"
        let secondPath = "/api/races/\(secondRace.id)"
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(firstPath)": [.json(makeDetailPayload(race: firstRace))],
                "GET \(secondPath)": [.json(makeDetailPayload(race: secondRace))],
            ],
            gatedKeys: ["GET \(firstPath)", "GET \(secondPath)"]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )

        let first = Task { try await repository.refreshDetail(id: firstRace.id, policy: .force) }
        let second = Task { try await repository.refreshDetail(id: secondRace.id, policy: .force) }
        await api.waitForCalls(to: firstPath, count: 1)
        await api.waitForCalls(to: secondPath, count: 1)
        await api.releaseRequests(to: firstPath)
        await api.releaseRequests(to: secondPath)

        _ = try await (first.value, second.value)
        let firstCalls = await api.calls(to: firstPath)
        let secondCalls = await api.calls(to: secondPath)

        XCTAssertEqual(firstCalls, 1)
        XCTAssertEqual(secondCalls, 1)
    }

    func testDetailFlightClearsAfterFailureAndSuccess() async throws {
        let race = RaceFixtures.upcoming
        let path = "/api/races/\(race.id)"
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(path)": [
                    .failure(.serverError(503, nil)),
                    .json(makeDetailPayload(race: race, entrants: [DriverFixtures.norris])),
                    .json(makeDetailPayload(race: race, entrants: [DriverFixtures.piastri])),
                ],
            ]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )

        do {
            _ = try await repository.refreshDetail(id: race.id, policy: .force)
            XCTFail("Expected the first detail refresh to fail")
        } catch {
            // A failed flight must be cleared before the next force.
        }

        _ = try await repository.refreshDetail(id: race.id, policy: .force)
        let third = try await repository.refreshDetail(id: race.id, policy: .force)
        let callCount = await api.calls(to: path)

        XCTAssertEqual(third.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(callCount, 3)
    }

    func testPrefetchUsesFirstTwoUniqueIDsConcurrentlyAndSwallowsFailures() async {
        let firstRace = RaceFixtures.race(
            id: "prefetch-a",
            round: 1,
            status: .upcoming,
            startOffset: 3_600
        )
        let secondRace = RaceFixtures.race(
            id: "prefetch-b",
            round: 2,
            status: .upcoming,
            startOffset: 7_200
        )
        let cappedRace = RaceFixtures.race(
            id: "prefetch-c",
            round: 3,
            status: .upcoming,
            startOffset: 10_800
        )
        let firstPath = "/api/races/\(firstRace.id)"
        let secondPath = "/api/races/\(secondRace.id)"
        let cappedPath = "/api/races/\(cappedRace.id)"
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(firstPath)": [.failure(.serverError(503, nil))],
                "GET \(secondPath)": [.json(makeDetailPayload(race: secondRace))],
            ],
            gatedKeys: ["GET \(firstPath)"]
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )

        let prefetch = Task {
            await repository.prefetchDetail(
                ids: [firstRace.id, firstRace.id, secondRace.id, cappedRace.id]
            )
        }
        await api.waitForCalls(to: firstPath, count: 1)
        await api.waitForCalls(to: secondPath, count: 1)
        await api.releaseRequests(to: firstPath)
        await prefetch.value

        let firstCalls = await api.calls(to: firstPath)
        let secondCalls = await api.calls(to: secondPath)
        let cappedCalls = await api.calls(to: cappedPath)
        let requests = await api.recordedRequests()

        XCTAssertEqual(firstCalls, 1)
        XCTAssertEqual(secondCalls, 1)
        XCTAssertEqual(cappedCalls, 0)
        XCTAssertEqual(requests.count, 2)
        XCTAssertTrue(requests.allSatisfy { $0.token == nil })
    }

    func testPrefetchReusesFreshCacheAndAlreadyInflightDetail() async throws {
        let cachedRace = RaceFixtures.race(
            id: "prefetch-cached",
            round: 1,
            status: .upcoming,
            startOffset: 3_600
        )
        let inflightRace = RaceFixtures.race(
            id: "prefetch-inflight",
            round: 2,
            status: .upcoming,
            startOffset: 7_200
        )
        let cappedRace = RaceFixtures.race(
            id: "prefetch-capped",
            round: 3,
            status: .upcoming,
            startOffset: 10_800
        )
        let cachedPath = "/api/races/\(cachedRace.id)"
        let inflightPath = "/api/races/\(inflightRace.id)"
        let cappedPath = "/api/races/\(cappedRace.id)"
        let cachedDetail = makeDetail(
            savedAt: RaceFixtures.now,
            race: cachedRace,
            entrants: [DriverFixtures.norris]
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(inflightPath)": [
                    .json(makeDetailPayload(race: inflightRace, entrants: [DriverFixtures.piastri])),
                ],
            ],
            gatedKeys: ["GET \(inflightPath)"]
        )
        let events = RepositoryEventProbe()
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(details: [cachedRace.id: cachedDetail]),
            clock: TestClock.fixed,
            onEvent: { event in await events.record(event) }
        )

        let inflight = Task {
            try await repository.refreshDetail(id: inflightRace.id, policy: .force)
        }
        await api.waitForCalls(to: inflightPath, count: 1)
        let prefetch = Task {
            await repository.prefetchDetail(
                ids: [cachedRace.id, inflightRace.id, cappedRace.id]
            )
        }
        await events.waitForDetailJoins(id: inflightRace.id, count: 1)
        await api.releaseRequests(to: inflightPath)

        _ = try await inflight.value
        await prefetch.value
        let cachedCalls = await api.calls(to: cachedPath)
        let inflightCalls = await api.calls(to: inflightPath)
        let cappedCalls = await api.calls(to: cappedPath)
        let requests = await api.recordedRequests()

        XCTAssertEqual(cachedCalls, 0)
        XCTAssertEqual(inflightCalls, 1)
        XCTAssertEqual(cappedCalls, 0)
        XCTAssertEqual(requests.count, 1)
        XCTAssertTrue(requests.allSatisfy { $0.token == nil })
    }

    func testReplacingPrefetchScopeCancelsStaleFlightsAndStartsOnlyLatestPair() async {
        let staleFirst = RaceFixtures.race(
            id: "prefetch-stale-a",
            round: 1,
            status: .upcoming,
            startOffset: 3_600
        )
        let staleSecond = RaceFixtures.race(
            id: "prefetch-stale-b",
            round: 2,
            status: .upcoming,
            startOffset: 7_200
        )
        let active = RaceFixtures.race(
            id: "prefetch-active",
            round: 3,
            status: .upcoming,
            startOffset: 10_800
        )
        let next = RaceFixtures.race(
            id: "prefetch-next",
            round: 4,
            status: .upcoming,
            startOffset: 14_400
        )
        let capped = RaceFixtures.race(
            id: "prefetch-capped-latest",
            round: 5,
            status: .upcoming,
            startOffset: 18_000
        )
        let api = CancellableDetailAPIClientSpy(
            payloads: [staleFirst, staleSecond, active, next, capped].reduce(into: [:]) {
                $0["/api/races/\($1.id)"] = makeDetailPayload(race: $1)
            }
        )
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed
        )

        let stalePrefetch = Task {
            await repository.replaceDetailPrefetch(
                ids: [staleFirst.id, staleFirst.id, staleSecond.id, capped.id]
            )
        }
        await api.waitForCalls(to: "/api/races/\(staleFirst.id)", count: 1)
        await api.waitForCalls(to: "/api/races/\(staleSecond.id)", count: 1)

        let latestPrefetch = Task {
            await repository.replaceDetailPrefetch(ids: [active.id, next.id, capped.id])
        }
        await api.waitForCancellations(to: "/api/races/\(staleFirst.id)", count: 1)
        await api.waitForCancellations(to: "/api/races/\(staleSecond.id)", count: 1)
        await api.waitForCalls(to: "/api/races/\(active.id)", count: 1)
        await api.waitForCalls(to: "/api/races/\(next.id)", count: 1)

        await api.releaseRequests(to: "/api/races/\(active.id)")
        await api.releaseRequests(to: "/api/races/\(next.id)")
        await latestPrefetch.value
        await stalePrefetch.value

        let cappedCalls = await api.calls(to: "/api/races/\(capped.id)")
        XCTAssertEqual(cappedCalls, 0)
    }

    func testReplacingPrefetchScopePreservesFlightPromotedByVisibleDetailDemand() async throws {
        let visibleRace = RaceFixtures.race(
            id: "prefetch-visible",
            round: 1,
            status: .upcoming,
            startOffset: 3_600
        )
        let staleRace = RaceFixtures.race(
            id: "prefetch-stale",
            round: 2,
            status: .upcoming,
            startOffset: 7_200
        )
        let active = RaceFixtures.race(
            id: "prefetch-replacement-active",
            round: 3,
            status: .upcoming,
            startOffset: 10_800
        )
        let next = RaceFixtures.race(
            id: "prefetch-replacement-next",
            round: 4,
            status: .upcoming,
            startOffset: 14_400
        )
        let api = CancellableDetailAPIClientSpy(
            payloads: [visibleRace, staleRace, active, next].reduce(into: [:]) {
                $0["/api/races/\($1.id)"] = makeDetailPayload(race: $1)
            }
        )
        let events = RepositoryEventProbe()
        let repository = RaceRepository(
            api: api,
            cache: MemoryRaceSnapshotCache(),
            clock: TestClock.fixed,
            onEvent: { event in await events.record(event) }
        )

        let firstPrefetch = Task {
            await repository.replaceDetailPrefetch(ids: [visibleRace.id, staleRace.id])
        }
        await api.waitForCalls(to: "/api/races/\(visibleRace.id)", count: 1)
        await api.waitForCalls(to: "/api/races/\(staleRace.id)", count: 1)
        let visibleDetail = Task {
            try await repository.refreshDetail(id: visibleRace.id, policy: .force)
        }
        await events.waitForDetailJoins(id: visibleRace.id, count: 1)

        let replacement = Task {
            await repository.replaceDetailPrefetch(ids: [active.id, next.id])
        }
        await api.waitForCancellations(to: "/api/races/\(staleRace.id)", count: 1)
        await api.waitForCalls(to: "/api/races/\(active.id)", count: 1)
        await api.waitForCalls(to: "/api/races/\(next.id)", count: 1)
        await api.releaseRequests(to: "/api/races/\(visibleRace.id)")
        await api.releaseRequests(to: "/api/races/\(active.id)")
        await api.releaseRequests(to: "/api/races/\(next.id)")

        let detail = try await visibleDetail.value
        await replacement.value
        await firstPrefetch.value

        XCTAssertEqual(detail.race.id, visibleRace.id)
        let visibleCancellations = await api.cancellations(
            to: "/api/races/\(visibleRace.id)"
        )
        XCTAssertEqual(visibleCancellations, 0)
    }

    func testCancelledPrefetchCannotPublishAfterNewerVisibleSameIDFlight() async throws {
        let race = RaceFixtures.race(
            id: "prefetch-same-id",
            round: 1,
            status: .upcoming,
            startOffset: 3_600
        )
        let path = "/api/races/\(race.id)"
        let api = GatedAPIClientSpy(
            responses: [
                "GET \(path)": [
                    .json(
                        makeDetailPayload(
                            race: race,
                            entrants: [DriverFixtures.norris]
                        )
                    ),
                    .json(
                        makeDetailPayload(
                            race: race,
                            entrants: [DriverFixtures.piastri]
                        )
                    ),
                ],
            ],
            gatedKeys: ["GET \(path)"]
        )
        let cache = MemoryRaceSnapshotCache()
        let repository = RaceRepository(
            api: api,
            cache: cache,
            clock: TestClock.fixed
        )

        let stalePrefetch = Task {
            await repository.replaceDetailPrefetch(ids: [race.id])
        }
        let staleRequestID = await api.waitForRequest(to: path, ordinal: 1)
        await repository.replaceDetailPrefetch(ids: [])

        let visibleRefresh = Task {
            try await repository.refreshDetail(id: race.id, policy: .force)
        }
        let visibleRequestID = await api.waitForRequest(to: path, ordinal: 2)
        await api.releaseRequest(id: visibleRequestID)
        let visible = try await visibleRefresh.value

        await api.releaseRequest(id: staleRequestID)
        await stalePrefetch.value

        let published = await repository.cachedDetail(id: race.id)
        let persisted = await cache.details[race.id]
        let writeCount = await cache.detailWriteCounts[race.id, default: 0]
        XCTAssertEqual(visible.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(published?.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(persisted?.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(writeCount, 1)
    }

    private func makeList(
        savedAt: Date,
        season: Season? = RaceFixtures.season2026,
        races: [Race]
    ) -> RaceListSnapshot {
        RaceListSnapshot(
            schemaVersion: RaceListSnapshot.currentSchemaVersion,
            savedAt: savedAt,
            season: season,
            races: races
        )
    }

    private func makeDetail(
        savedAt: Date,
        race: Race,
        entrants: [Driver] = [],
        results: [RaceResult] = [],
        qualifyingResults: [QualifyingResultRow] = []
    ) -> RaceDetailSnapshot {
        RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: savedAt,
            race: race,
            entrants: entrants,
            results: results,
            qualifyingResults: qualifyingResults
        )
    }

    private func makeDetailPayload(
        race: Race,
        entrants: [Driver] = [],
        results: [RaceResult] = [],
        qualifyingResults: [QualifyingResultRow]? = []
    ) -> RaceDetailPayload {
        RaceDetailPayload(
            race: race,
            entrants: entrants,
            results: results,
            qualifyingResults: qualifyingResults
        )
    }
}

private actor RepositoryEventProbe {
    private struct Waiter {
        let count: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    private var listJoinCount = 0
    private var listWaiters: [Waiter] = []
    private var detailJoinCounts: [String: Int] = [:]
    private var detailWaiters: [String: [Waiter]] = [:]

    func record(_ event: RaceRepositoryEvent) {
        switch event {
        case .joinedListFlight:
            listJoinCount += 1
            resumeSatisfiedListWaiters()
        case .startedDetailFlight:
            break
        case .joinedDetailFlight(let id):
            detailJoinCounts[id, default: 0] += 1
            resumeSatisfiedDetailWaiters(id: id)
        }
    }

    func waitForListJoins(count: Int) async {
        guard listJoinCount < count else { return }
        await withCheckedContinuation { continuation in
            listWaiters.append(Waiter(count: count, continuation: continuation))
        }
    }

    func waitForDetailJoins(id: String, count: Int) async {
        guard detailJoinCounts[id, default: 0] < count else { return }
        await withCheckedContinuation { continuation in
            detailWaiters[id, default: []].append(
                Waiter(count: count, continuation: continuation)
            )
        }
    }

    private func resumeSatisfiedListWaiters() {
        var pending: [Waiter] = []
        for waiter in listWaiters {
            if listJoinCount >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        listWaiters = pending
    }

    private func resumeSatisfiedDetailWaiters(id: String) {
        let count = detailJoinCounts[id, default: 0]
        var pending: [Waiter] = []
        for waiter in detailWaiters.removeValue(forKey: id) ?? [] {
            if count >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        if !pending.isEmpty {
            detailWaiters[id] = pending
        }
    }
}

private actor CancellableDetailAPIClientSpy: APIRequesting {
    private struct PendingRequest {
        let path: String
        let continuation: CheckedContinuation<Data, Error>
    }

    private struct CountWaiter {
        let count: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    private let payloads: [String: RaceDetailPayload]
    private var nextRequestID = 0
    private var pendingRequests: [Int: PendingRequest] = [:]
    private var callCounts: [String: Int] = [:]
    private var cancellationCounts: [String: Int] = [:]
    private var callWaiters: [String: [CountWaiter]] = [:]
    private var cancellationWaiters: [String: [CountWaiter]] = [:]

    init(payloads: [String: RaceDetailPayload]) {
        self.payloads = payloads
    }

    func request<T: Decodable & Sendable>(
        _ endpoint: APIEndpoint,
        token: String?
    ) async throws -> T {
        let path = endpoint.path
        guard let payload = payloads[path] else {
            throw APIError.notFound
        }

        nextRequestID += 1
        let requestID = nextRequestID
        callCounts[path, default: 0] += 1
        resumeSatisfiedCallWaiters(for: path)

        let data: Data = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Data, Error>) in
                if Task.isCancelled {
                    recordCancellation(path: path)
                    continuation.resume(throwing: CancellationError())
                } else {
                    pendingRequests[requestID] = PendingRequest(
                        path: path,
                        continuation: continuation
                    )
                }
            }
        } onCancel: {
            Task { await self.cancelRequest(id: requestID) }
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encoded = try encoder.encode(payload)
        guard data.isEmpty else {
            return try JSONDecoder.api().decode(T.self, from: data)
        }
        return try JSONDecoder.api().decode(T.self, from: encoded)
    }

    func waitForCalls(to path: String, count: Int) async {
        guard callCounts[path, default: 0] < count else { return }
        await withCheckedContinuation { continuation in
            callWaiters[path, default: []].append(
                CountWaiter(count: count, continuation: continuation)
            )
        }
    }

    func waitForCancellations(to path: String, count: Int) async {
        guard cancellationCounts[path, default: 0] < count else { return }
        await withCheckedContinuation { continuation in
            cancellationWaiters[path, default: []].append(
                CountWaiter(count: count, continuation: continuation)
            )
        }
    }

    func releaseRequests(to path: String) {
        let matchingIDs = pendingRequests.compactMap { id, request in
            request.path == path ? id : nil
        }
        for id in matchingIDs {
            pendingRequests.removeValue(forKey: id)?.continuation.resume(returning: Data())
        }
    }

    func calls(to path: String) -> Int {
        callCounts[path, default: 0]
    }

    func cancellations(to path: String) -> Int {
        cancellationCounts[path, default: 0]
    }

    private func cancelRequest(id: Int) {
        guard let request = pendingRequests.removeValue(forKey: id) else { return }
        recordCancellation(path: request.path)
        request.continuation.resume(throwing: CancellationError())
    }

    private func recordCancellation(path: String) {
        cancellationCounts[path, default: 0] += 1
        resumeSatisfiedCancellationWaiters(for: path)
    }

    private func resumeSatisfiedCallWaiters(for path: String) {
        let count = callCounts[path, default: 0]
        var pending: [CountWaiter] = []
        for waiter in callWaiters.removeValue(forKey: path) ?? [] {
            if count >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        if !pending.isEmpty {
            callWaiters[path] = pending
        }
    }

    private func resumeSatisfiedCancellationWaiters(for path: String) {
        let count = cancellationCounts[path, default: 0]
        var pending: [CountWaiter] = []
        for waiter in cancellationWaiters.removeValue(forKey: path) ?? [] {
            if count >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        if !pending.isEmpty {
            cancellationWaiters[path] = pending
        }
    }
}
