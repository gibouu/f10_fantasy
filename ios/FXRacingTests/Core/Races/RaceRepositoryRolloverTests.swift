import Foundation
import XCTest
@testable import FXRacing

final class RaceRepositoryRolloverTests: XCTestCase {
    func testTrueSeasonRolloverPublishesAndHidesOrphanBeforeDiskPrune() async throws {
        let oldRace = makeRace(id: "old-race", seasonID: "season-old", round: 1)
        let newRace = makeRace(id: "new-race", seasonID: "season-new", round: 1)
        let oldDetail = makeDetail(race: oldRace, driver: DriverFixtures.norris)
        let cache = MemoryRaceSnapshotCache(
            list: makeList(seasonID: "season-old", races: [oldRace]),
            details: [oldRace.id: oldDetail],
            gatesListWrites: true
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races": [
                    .json(
                        RaceListPayload(
                            races: [newRace],
                            season: Season(id: "season-new", year: 2027)
                        )
                    ),
                ],
            ]
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
        _ = await repository.cachedList()
        _ = await repository.cachedDetail(id: oldRace.id)

        let refresh = Task { try await repository.refreshList(policy: .force) }
        await cache.waitForListWrites(count: 1)

        let visibleList = await repository.cachedList()
        let hiddenOrphan = await repository.cachedDetail(id: oldRace.id)
        let pruneBeforeRelease = await cache.pruneCount

        XCTAssertEqual(visibleList?.season?.id, "season-new")
        XCTAssertNil(hiddenOrphan)
        XCTAssertEqual(pruneBeforeRelease, 0)

        await cache.releaseListWrites()
        _ = try await refresh.value

        let pruneAfterRelease = await cache.pruneCount
        let prunedSets = await cache.prunedRaceIDSets
        let diskDetails = await cache.details
        let persistedList = await cache.list
        XCTAssertEqual(pruneAfterRelease, 1)
        XCTAssertEqual(prunedSets.last, Set([newRace.id]))
        XCTAssertNil(diskDetails[oldRace.id])
        XCTAssertEqual(persistedList?.validatedDetailSeasonID, "season-new")
    }

    func testRolloverListWriteFailurePublishesAndHidesOrphanWithoutDiskPrune() async throws {
        let oldRace = makeRace(id: "old-race", seasonID: "season-old", round: 1)
        let newRace = makeRace(id: "new-race", seasonID: "season-new", round: 1)
        let oldDetail = makeDetail(race: oldRace, driver: DriverFixtures.norris)
        let cache = MemoryRaceSnapshotCache(
            list: makeList(seasonID: "season-old", races: [oldRace]),
            details: [oldRace.id: oldDetail],
            failListWrites: true
        )
        let api = APIClientSpy(
            responses: [
                "GET /api/races": .json(
                    RaceListPayload(
                        races: [newRace],
                        season: Season(id: "season-new", year: 2027)
                    )
                ),
            ]
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
        _ = await repository.cachedList()
        _ = await repository.cachedDetail(id: oldRace.id)

        let refreshed = try await repository.refreshList(policy: .force)
        let hiddenOrphan = await repository.cachedDetail(id: oldRace.id)
        let pruneCount = await cache.pruneCount
        let diskDetails = await cache.details

        XCTAssertEqual(refreshed.season?.id, "season-new")
        XCTAssertNil(hiddenOrphan)
        XCTAssertEqual(pruneCount, 0)
        XCTAssertEqual(diskDetails[oldRace.id]?.race.id, oldRace.id)
    }

    func testSameSeasonRemovalDoesNotGloballyPruneDetails() async throws {
        let removed = makeRace(id: "removed", seasonID: "season-stable", round: 1)
        let kept = makeRace(id: "kept", seasonID: "season-stable", round: 2)
        let removedDetail = makeDetail(race: removed, driver: DriverFixtures.norris)
        let cache = MemoryRaceSnapshotCache(
            list: makeList(seasonID: "season-stable", races: [removed, kept]),
            details: [removed.id: removedDetail]
        )
        let api = APIClientSpy(
            responses: [
                "GET /api/races": .json(
                    RaceListPayload(
                        races: [kept],
                        season: Season(id: "season-stable", year: 2027)
                    )
                ),
            ]
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
        _ = await repository.cachedList()
        _ = await repository.cachedDetail(id: removed.id)

        _ = try await repository.refreshList(policy: .force)

        let retained = await repository.cachedDetail(id: removed.id)
        let pruneCount = await cache.pruneCount
        XCTAssertEqual(retained?.race.id, removed.id)
        XCTAssertEqual(pruneCount, 0)
    }

    func testNilSeasonTransitionsDoNotGloballyPruneDetails() async throws {
        let cases: [(old: Season?, new: Season?)] = [
            (nil, Season(id: "season-new", year: 2027)),
            (Season(id: "season-old", year: 2026), nil),
        ]

        for (index, transition) in cases.enumerated() {
            let race = makeRace(id: "race-\(index)", seasonID: "season-old", round: 1)
            let detail = makeDetail(race: race, driver: DriverFixtures.norris)
            let cache = MemoryRaceSnapshotCache(
                list: RaceListSnapshot(
                    schemaVersion: RaceListSnapshot.currentSchemaVersion,
                    savedAt: RaceFixtures.now,
                    season: transition.old,
                    races: [race]
                ),
                details: [race.id: detail]
            )
            let api = APIClientSpy(
                responses: [
                    "GET /api/races": .json(
                        RaceListPayload(races: [], season: transition.new)
                    ),
                ]
            )
            let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
            _ = await repository.cachedList()
            _ = await repository.cachedDetail(id: race.id)

            _ = try await repository.refreshList(policy: .force)

            let retained = await repository.cachedDetail(id: race.id)
            let pruneCount = await cache.pruneCount
            XCTAssertEqual(retained?.race.id, race.id, "case \(index)")
            XCTAssertEqual(pruneCount, 0, "case \(index)")
        }
    }

    func testLateOldSeasonDetailCannotPublishOrWriteAfterRollover() async throws {
        let oldRace = makeRace(id: "old-race", seasonID: "season-old", round: 1)
        let newRace = makeRace(id: "new-race", seasonID: "season-new", round: 1)
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races/\(oldRace.id)": [
                    .json(makePayload(race: oldRace, driver: DriverFixtures.norris)),
                ],
                "GET /api/races": [
                    .json(
                        RaceListPayload(
                            races: [newRace],
                            season: Season(id: "season-new", year: 2027)
                        )
                    ),
                ],
            ],
            gatedKeys: ["GET /api/races/\(oldRace.id)"]
        )
        let cache = MemoryRaceSnapshotCache(
            list: makeList(seasonID: "season-old", races: [oldRace])
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
        _ = await repository.cachedList()

        let oldRefresh = Task {
            try await repository.refreshDetail(id: oldRace.id, policy: .force)
        }
        let oldRequestID = await api.waitForRequest(
            to: "/api/races/\(oldRace.id)",
            ordinal: 1
        )

        _ = try await repository.refreshList(policy: .force)
        await api.releaseRequest(id: oldRequestID)

        do {
            _ = try await oldRefresh.value
            XCTFail("Expected the old-season detail flight to be invalidated")
        } catch {
            // Cancellation or epoch invalidation is the expected outcome.
        }

        let hidden = await repository.cachedDetail(id: oldRace.id)
        let writeCounts = await cache.detailWriteCounts
        XCTAssertNil(hidden)
        XCTAssertEqual(writeCounts[oldRace.id, default: 0], 0)
    }

    func testReusedRaceIDStartsNewEpochFlightAndOldFlightCannotClearIt() async throws {
        let sharedID = "shared-race"
        let oldRace = makeRace(id: sharedID, seasonID: "season-old", round: 1)
        let newRace = makeRace(id: sharedID, seasonID: "season-new", round: 1)
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/races/\(sharedID)": [
                    .json(makePayload(race: oldRace, driver: DriverFixtures.norris)),
                    .json(makePayload(race: newRace, driver: DriverFixtures.piastri)),
                ],
                "GET /api/races": [
                    .json(
                        RaceListPayload(
                            races: [newRace],
                            season: Season(id: "season-new", year: 2027)
                        )
                    ),
                ],
            ],
            gatedKeys: ["GET /api/races/\(sharedID)"]
        )
        let cache = MemoryRaceSnapshotCache(
            list: makeList(seasonID: "season-old", races: [oldRace])
        )
        let decisions = DetailDecisionProbe()
        let repository = RaceRepository(
            api: api,
            cache: cache,
            clock: TestClock.fixed,
            onEvent: { event in await decisions.record(event) }
        )
        _ = await repository.cachedList()

        let oldRefresh = Task {
            try await repository.refreshDetail(id: sharedID, policy: .force)
        }
        let oldDecision = await decisions.next()
        XCTAssertEqual(oldDecision, .startedDetailFlight(sharedID))
        let oldRequestID = await api.waitForRequest(to: "/api/races/\(sharedID)", ordinal: 1)

        _ = try await repository.refreshList(policy: .force)

        let newRefresh = Task {
            try await repository.refreshDetail(id: sharedID, policy: .force)
        }
        let newDecision = await decisions.next()
        XCTAssertEqual(newDecision, .startedDetailFlight(sharedID))
        guard newDecision == .startedDetailFlight(sharedID) else {
            await api.releaseRequest(id: oldRequestID)
            _ = try? await oldRefresh.value
            _ = try? await newRefresh.value
            return
        }
        let newRequestID = await api.waitForRequest(to: "/api/races/\(sharedID)", ordinal: 2)

        await api.releaseRequest(id: oldRequestID)
        _ = try? await oldRefresh.value

        let joinedRefresh = Task {
            try await repository.refreshDetail(id: sharedID, policy: .force)
        }
        let joinedDecision = await decisions.next()
        XCTAssertEqual(joinedDecision, .joinedDetailFlight(sharedID))

        await api.releaseRequest(id: newRequestID)
        let newSnapshot = try await newRefresh.value
        let joinedSnapshot = try await joinedRefresh.value
        let published = await repository.cachedDetail(id: sharedID)

        XCTAssertEqual(newSnapshot.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(joinedSnapshot.entrants.map(\.id), [DriverFixtures.piastri.id])
        XCTAssertEqual(published?.entrants.map(\.id), [DriverFixtures.piastri.id])
    }

    func testOldEpochDetailWriteResumingAfterPruneCannotRecreateDiskEntry() async throws {
        let oldRace = makeRace(id: "old-race", seasonID: "season-old", round: 1)
        let newRace = makeRace(id: "new-race", seasonID: "season-new", round: 1)
        let cache = MemoryRaceSnapshotCache(
            list: makeList(seasonID: "season-old", races: [oldRace]),
            gatedDetailWrites: [oldRace.id]
        )
        let api = APIClientSpy(
            responses: [
                "GET /api/races/\(oldRace.id)": .json(
                    makePayload(race: oldRace, driver: DriverFixtures.norris)
                ),
                "GET /api/races": .json(
                    RaceListPayload(
                        races: [newRace],
                        season: Season(id: "season-new", year: 2027)
                    )
                ),
            ]
        )
        let repository = RaceRepository(api: api, cache: cache, clock: TestClock.fixed)
        _ = await repository.cachedList()

        let oldRefresh = Task {
            try await repository.refreshDetail(id: oldRace.id, policy: .force)
        }
        await cache.waitForDetailWrites(id: oldRace.id, count: 1)

        _ = try await repository.refreshList(policy: .force)
        let pruneCount = await cache.pruneCount
        XCTAssertEqual(pruneCount, 1)

        await cache.releaseDetailWrites(id: oldRace.id)
        _ = try? await oldRefresh.value

        let diskDetails = await cache.details
        let visible = await repository.cachedDetail(id: oldRace.id)
        XCTAssertNil(diskDetails[oldRace.id])
        XCTAssertNil(visible)
    }

    func testColdStartRejectsOldSeasonDiskDetailForReusedRaceID() async throws {
        let sharedID = "shared-race"
        let oldRace = makeRace(id: sharedID, seasonID: "season-old", round: 1)
        let newRace = makeRace(id: sharedID, seasonID: "season-new", round: 1)
        let cache = MemoryRaceSnapshotCache(
            list: makeList(seasonID: "season-new", races: [newRace]),
            details: [sharedID: makeDetail(race: oldRace, driver: DriverFixtures.norris)]
        )
        let repository = RaceRepository(
            api: APIClientSpy(responses: [:]),
            cache: cache,
            clock: TestClock.fixed
        )

        let stale = await repository.cachedDetail(id: sharedID)

        XCTAssertNil(stale)
    }

    func testColdStartRejectsOldSeasonOrphanAbsentFromCurrentList() async throws {
        let oldRace = makeRace(id: "old-orphan", seasonID: "season-old", round: 1)
        let newRace = makeRace(id: "new-race", seasonID: "season-new", round: 1)
        let cache = MemoryRaceSnapshotCache(
            list: makeList(
                seasonID: "season-new",
                races: [newRace],
                validatedDetailSeasonID: "season-new"
            ),
            details: [oldRace.id: makeDetail(race: oldRace, driver: DriverFixtures.norris)]
        )
        let repository = RaceRepository(
            api: APIClientSpy(responses: [:]),
            cache: cache,
            clock: TestClock.fixed
        )

        let stale = await repository.cachedDetail(id: oldRace.id)

        XCTAssertNil(stale)
    }

    private func makeRace(
        id: String,
        seasonID: String,
        round: Int
    ) -> Race {
        Race(
            id: id,
            seasonId: seasonID,
            round: round,
            name: "Race \(round)",
            circuitName: "Circuit \(round)",
            country: "Belgium",
            type: .main,
            scheduledStartUtc: RaceFixtures.now.addingTimeInterval(86_400),
            lockCutoffUtc: RaceFixtures.now.addingTimeInterval(86_280),
            status: .upcoming,
            qualifyingStartUtc: RaceFixtures.now.addingTimeInterval(43_200)
        )
    }

    private func makeList(
        seasonID: String,
        races: [Race],
        validatedDetailSeasonID: String? = nil
    ) -> RaceListSnapshot {
        RaceListSnapshot(
            schemaVersion: RaceListSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            season: Season(id: seasonID, year: seasonID == "season-old" ? 2026 : 2027),
            races: races,
            validatedDetailSeasonID: validatedDetailSeasonID
        )
    }

    private func makeDetail(race: Race, driver: Driver) -> RaceDetailSnapshot {
        RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            race: race,
            entrants: [driver],
            results: [],
            qualifyingResults: []
        )
    }

    private func makePayload(race: Race, driver: Driver) -> RaceDetailPayload {
        RaceDetailPayload(
            race: race,
            entrants: [driver],
            results: [],
            qualifyingResults: []
        )
    }
}

private actor DetailDecisionProbe {
    private var events: [RaceRepositoryEvent] = []
    private var waiters: [CheckedContinuation<RaceRepositoryEvent, Never>] = []

    func record(_ event: RaceRepositoryEvent) {
        switch event {
        case .startedDetailFlight(_), .joinedDetailFlight(_):
            enqueue(event)
        case .joinedListFlight:
            break
        }
    }

    func next() async -> RaceRepositoryEvent {
        if !events.isEmpty {
            return events.removeFirst()
        }
        return await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    private func enqueue(_ event: RaceRepositoryEvent) {
        if !waiters.isEmpty {
            waiters.removeFirst().resume(returning: event)
        } else {
            events.append(event)
        }
    }
}
