import Foundation
import XCTest
@testable import FXRacing

@MainActor
final class SyncManagerTests: XCTestCase {
    func testCurrentSessionLeaseRevalidatesUserTokenAndInvalidation() {
        let context = makeContext()
        defer { context.cleanUp() }
        let manager = SyncManager(
            api: GatedAPIClientSpy(responses: [:]),
            clock: TestClock.fixed
        )
        manager.setUnauthorizedHandler { _ in }

        let first = manager.beginSession(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        XCTAssertEqual(
            manager.currentSessionLease(
                currentUserID: "user-a",
                token: "token-a"
            ),
            first
        )
        XCTAssertNil(
            manager.currentSessionLease(
                currentUserID: "user-b",
                token: "token-a"
            )
        )
        XCTAssertNil(
            manager.currentSessionLease(
                currentUserID: "user-a",
                token: "token-b"
            )
        )
        XCTAssertTrue(manager.isCurrent(first))

        let replacement = manager.beginSession(
            currentUserID: "user-a",
            token: "token-b",
            localPickStore: context.store
        )

        XCTAssertFalse(manager.isCurrent(first))
        XCTAssertTrue(manager.isCurrent(replacement))
        manager.invalidateSession(localPickStore: context.store)
        XCTAssertFalse(manager.isCurrent(replacement))
    }

    func testExplicitSavePostsWithoutPreflightGetAndConfirmsRevision() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: ["POST /api/picks": [.json(PickResponse(pick: pick(for: record)))]],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let submission = Task {
            await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )

        XCTAssertEqual(
            context.store.record(id: record.id)?.syncState,
            .syncing(revision: record.revision, mode: .direct)
        )
        let preflightCalls = await api.calls(to: "/api/picks")
        let recordedRequests = await api.recordedRequests()
        XCTAssertEqual(preflightCalls, 0)
        let request = try XCTUnwrap(recordedRequests.first)
        XCTAssertEqual(request.token, "token-a")
        XCTAssertEqual(request.query, [:])
        let requestBody = try body(from: request)
        XCTAssertEqual(requestBody["raceId"] as? String, record.id.raceID)
        XCTAssertEqual(
            requestBody["winnerDriverId"] as? String,
            record.selection.winnerDriverID
        )
        XCTAssertEqual(
            requestBody["tenthPlaceDriverId"] as? String,
            record.selection.tenthPlaceDriverID
        )
        XCTAssertEqual(
            requestBody["dnfDriverId"] as? String,
            record.selection.dnfDriverID
        )
        XCTAssertNil(requestBody["savedAt"])

        await api.releaseRequest(id: requestID)
        guard case .saved(let saved) = await submission.value else {
            return XCTFail("Expected the explicit POST to save")
        }
        XCTAssertEqual(saved.raceId, record.id.raceID)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testExplicitSaveSendsAuthoritativePickVersionAsIfMatch() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let baseVersion = "2026-07-24T18:33:00.000Z"
        XCTAssertTrue(
            context.store.preserveAuthoritative(
                pick(
                    raceID: record.id.raceID,
                    selection: PickSelection(
                        winnerDriverID: "piastri",
                        tenthPlaceDriverID: "leclerc",
                        dnfDriverID: "norris"
                    ),
                    id: "server-baseline",
                    version: baseVersion
                ),
                for: .user("user-a")
            )
        )
        let api = GatedAPIClientSpy(
            responses: ["POST /api/picks": [.json(PickResponse(pick: pick(for: record)))]]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        guard case .saved = await manager.submitExplicit(
            id: record.id,
            revision: record.revision,
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        ) else {
            return XCTFail("Expected save")
        }

        let request = try XCTUnwrap(await api.recordedRequests().first)
        XCTAssertEqual(request.headers["If-Match"], "\"\(baseVersion)\"")
        XCTAssertNil(try body(from: request)["baseVersion"])
    }

    func testExplicitSaveRejectsWrongOwnerGuestAndTerminalWithoutRequests() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let account = try saveRecord(in: context.store, owner: .user("user-a"))
        let guest = try saveRecord(
            in: context.store,
            race: RaceFixtures.upcoming,
            owner: .guest
        )
        let api = GatedAPIClientSpy(responses: [:])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let wrongAccount = await manager.submitExplicit(
            id: account.id,
            revision: account.revision,
            currentUserID: "user-b",
            token: "token-b",
            localPickStore: context.store
        )
        let guestResult = await manager.submitExplicit(
            id: guest.id,
            revision: guest.revision,
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )
        XCTAssertTrue(
            context.store.transition(
                id: account.id,
                revision: account.revision,
                to: .conflict(.accountPickFound)
            )
        )
        let terminal = await manager.submitExplicit(
            id: account.id,
            revision: account.revision,
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        assertQueued(wrongAccount)
        assertQueued(guestResult)
        assertQueued(terminal)
        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.isEmpty)
    }

    func testDuplicateExplicitSaveJoinsOneWorker() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: ["POST /api/picks": [.json(PickResponse(pick: pick(for: record)))]],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let first = Task {
            await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )
        let second = Task {
            await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }

        await api.releaseRequest(id: requestID)
        _ = await first.value
        _ = await second.value
        let postCalls = await api.calls(method: "POST", to: "/api/picks")
        XCTAssertEqual(postCalls, 1)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testNewerAccountSaveWaitsForGuestMigrationOnTheSameRace() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let guest = try saveRecord(in: context.store, owner: .guest)
        let accountSelection = PickSelection(
            winnerDriverID: "leclerc",
            tenthPlaceDriverID: "norris",
            dnfDriverID: "piastri"
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [.failure(.notFound)],
                "POST /api/picks": [
                    .json(PickResponse(pick: pick(for: guest))),
                    .json(PickResponse(pick: pick(
                        raceID: guest.id.raceID,
                        selection: accountSelection,
                        id: "account-newer"
                    ))),
                ],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let migration = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let guestRequestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )
        guard case .saved(let account) = context.store.save(
            selection: accountSelection,
            race: RaceFixtures.liveSpa,
            owner: .user("user-a"),
            now: RaceFixtures.now
        ) else {
            return XCTFail("Expected a newer account revision")
        }
        let explicitStarted = expectation(description: "Account save entered sync lane")
        let explicit = Task { @MainActor in
            explicitStarted.fulfill()
            return await manager.submitExplicit(
                id: account.id,
                revision: account.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        await fulfillment(of: [explicitStarted], timeout: 1)
        for _ in 0..<20 {
            await Task.yield()
        }
        let postsBeforeGuestFinishes = await api.calls(
            method: "POST",
            to: "/api/picks"
        )
        XCTAssertEqual(postsBeforeGuestFinishes, 1)

        await api.releaseRequest(id: guestRequestID)
        let accountRequestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 2
        )
        let requests = await api.recordedRequests().filter { $0.method == "POST" }
        XCTAssertEqual(
            try body(from: requests[1])["winnerDriverId"] as? String,
            accountSelection.winnerDriverID
        )
        await api.releaseRequest(id: accountRequestID)

        await migration.value
        guard case .saved(let saved) = await explicit.value else {
            return XCTFail("Expected the newer account save to finish")
        }
        XCTAssertEqual(saved.id, "account-newer")
        XCTAssertEqual(context.store.record(id: account.id)?.selection, accountSelection)
        XCTAssertEqual(context.store.record(id: account.id)?.syncState, .confirmed)
        XCTAssertEqual(context.store.record(id: guest.id)?.syncState, .confirmed)
    }

    func testFailedNewerAccountSaveSuppressesOlderGuestUpload() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let guest = try saveRecord(in: context.store, owner: .guest)
        let accountSelection = PickSelection(
            winnerDriverID: "leclerc",
            tenthPlaceDriverID: "norris",
            dnfDriverID: "piastri"
        )
        let account = try saveRecord(
            in: context.store,
            owner: .user("user-a"),
            selection: accountSelection
        )
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [
                    .failure(.networkFailed(SyncManagerTestError.offline)),
                ],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let explicit = Task {
            await manager.submitExplicit(
                id: account.id,
                revision: account.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let accountRequestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )
        let migration = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }

        await api.releaseRequest(id: accountRequestID)
        assertQueued(await explicit.value)
        await migration.value

        let requests = await api.recordedRequests()
        XCTAssertEqual(requests.map(\.method), ["POST"])
        XCTAssertNil(context.store.record(id: guest.id))
        XCTAssertEqual(context.store.record(id: account.id)?.selection, accountSelection)
        XCTAssertEqual(context.store.record(id: account.id)?.syncState, .queued)
    }

    func testStaleGuestPreflightCannotRemoveANewerGuestRevision() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let guest = try saveRecord(in: context.store, owner: .guest)
        let api = GatedAPIClientSpy(
            responses: ["GET /api/picks": [.failure(.notFound)]],
            gatedKeys: ["GET /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let migration = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let getRequestID = await api.waitForRequest(
            method: "GET",
            to: "/api/picks",
            ordinal: 1
        )
        _ = try saveRecord(
            in: context.store,
            owner: .user("user-a"),
            selection: PickSelection(
                winnerDriverID: "leclerc",
                tenthPlaceDriverID: "norris",
                dnfDriverID: "piastri"
            )
        )
        let newestSelection = PickSelection(
            winnerDriverID: "piastri",
            tenthPlaceDriverID: "norris",
            dnfDriverID: "leclerc"
        )
        let newestGuest = try saveRecord(
            in: context.store,
            owner: .guest,
            selection: newestSelection
        )
        XCTAssertGreaterThan(newestGuest.revision, guest.revision)

        await api.releaseRequest(id: getRequestID)
        await migration.value

        XCTAssertEqual(context.store.record(id: guest.id)?.revision, newestGuest.revision)
        XCTAssertEqual(context.store.record(id: guest.id)?.selection, newestSelection)
        XCTAssertEqual(context.store.record(id: guest.id)?.syncState, .queued)
        let postCalls = await api.calls(method: "POST", to: "/api/picks")
        XCTAssertEqual(postCalls, 0)
    }

    func testExplicitIntentJoiningMatchingAutomaticGetConfirmsWithoutPost() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [.json(PickResponse(pick: pick(for: record)))],
            ],
            gatedKeys: ["GET /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let automatic = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let getID = await api.waitForRequest(to: "/api/picks", ordinal: 1)
        let explicitStarted = expectation(description: "Explicit save joined worker")
        let explicit = Task { @MainActor in
            explicitStarted.fulfill()
            return await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        await fulfillment(of: [explicitStarted], timeout: 1)

        await api.releaseRequest(id: getID)
        await automatic.value
        guard case .saved = await explicit.value else {
            return XCTFail("Matching GET should satisfy the explicit intent")
        }
        let getCalls = await api.calls(to: "/api/picks")
        let postCalls = await api.calls(method: "POST", to: "/api/picks")
        XCTAssertEqual(getCalls, 1)
        XCTAssertEqual(postCalls, 0)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testExplicitIntentJoiningDifferentAutomaticGetContinuesToPost() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let serverSelection = PickSelection(
            winnerDriverID: "piastri",
            tenthPlaceDriverID: "leclerc",
            dnfDriverID: "norris"
        )
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [.json(PickResponse(pick: pick(
                    raceID: record.id.raceID,
                    selection: serverSelection,
                    id: "different"
                )))],
                "POST /api/picks": [.json(PickResponse(pick: pick(for: record)))],
            ],
            gatedKeys: ["GET /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let automatic = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let getID = await api.waitForRequest(to: "/api/picks", ordinal: 1)
        let explicitStarted = expectation(description: "Explicit save joined worker")
        let explicit = Task { @MainActor in
            explicitStarted.fulfill()
            return await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        await fulfillment(of: [explicitStarted], timeout: 1)

        await api.releaseRequest(id: getID)
        await automatic.value
        guard case .saved = await explicit.value else {
            return XCTFail("Explicit intent should POST instead of conflicting")
        }
        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["GET", "POST"])
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testExplicitIntentJoiningGet423ContinuesToPost() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [.failure(.serverError(423, "Preflight locked"))],
                "POST /api/picks": [.json(PickResponse(pick: pick(for: record)))],
            ],
            gatedKeys: ["GET /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let automatic = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let getID = await api.waitForRequest(to: "/api/picks", ordinal: 1)
        let explicitStarted = expectation(description: "Explicit save joined worker")
        let explicit = Task { @MainActor in
            explicitStarted.fulfill()
            return await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        await fulfillment(of: [explicitStarted], timeout: 1)

        await api.releaseRequest(id: getID)
        await automatic.value
        guard case .saved = await explicit.value else {
            return XCTFail("A user Save should override a failed GET preflight")
        }
        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["GET", "POST"])
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testConcurrentResumeCallsProduceOneGet() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/picks": [.json(PickResponse(pick: pick(for: record)))],
            ],
            gatedKeys: ["GET /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let first = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let getID = await api.waitForRequest(to: "/api/picks", ordinal: 1)
        let second = Task {
            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        await api.releaseRequest(id: getID)
        await first.value
        await second.value

        let getCalls = await api.calls(to: "/api/picks")
        XCTAssertEqual(getCalls, 1)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testChangedSaveDuringUploadPostsNewestRevisionNext() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let firstRecord = try saveRecord(in: context.store, owner: .user("user-a"))
        let changedSelection = PickSelection(
            winnerDriverID: "leclerc",
            tenthPlaceDriverID: "norris",
            dnfDriverID: "piastri"
        )
        let firstPick = pick(for: firstRecord)
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [
                    .json(PickResponse(pick: firstPick)),
                    .json(PickResponse(pick: pick(
                        raceID: firstRecord.id.raceID,
                        selection: changedSelection,
                        id: "pick-new"
                    ))),
                ],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let first = Task {
            await manager.submitExplicit(
                id: firstRecord.id,
                revision: firstRecord.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }
        let firstRequestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )
        let changed = context.store.save(
            selection: changedSelection,
            race: RaceFixtures.liveSpa,
            owner: .user("user-a"),
            now: RaceFixtures.now
        )
        guard case .saved(let newest) = changed else {
            return XCTFail("Expected a newer local revision")
        }
        let second = Task {
            await manager.submitExplicit(
                id: newest.id,
                revision: newest.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )
        }

        await api.releaseRequest(id: firstRequestID)
        let secondRequestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 2
        )
        let requests = await api.recordedRequests()
        XCTAssertEqual(
            try body(from: requests[1])["winnerDriverId"] as? String,
            changedSelection.winnerDriverID
        )
        await api.releaseRequest(id: secondRequestID)

        guard case .saved(let firstResult) = await first.value,
              case .saved(let secondResult) = await second.value
        else { return XCTFail("Joined callers should receive the newest result") }
        XCTAssertEqual(firstResult.id, "pick-new")
        XCTAssertEqual(secondResult.id, "pick-new")
        XCTAssertEqual(context.store.record(id: newest.id)?.syncState, .confirmed)
    }

    func testFailedExplicitAttemptLaterResumesWithGetFirst() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(responses: [
            "POST /api/picks": [
                .failure(.networkFailed(SyncManagerTestError.offline)),
            ],
            "GET /api/picks": [
                .json(PickResponse(pick: pick(for: record))),
            ],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let direct = await manager.submitExplicit(
            id: record.id,
            revision: record.revision,
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )
        assertQueued(direct)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .queued)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["POST", "GET"])
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testAutomaticIdenticalPickConfirmsWithGetOnly() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(responses: [
            "GET /api/picks": [.json(PickResponse(pick: pick(for: record)))],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        let getCalls = await api.calls(to: "/api/picks")
        let postCalls = await api.calls(method: "POST", to: "/api/picks")
        XCTAssertEqual(getCalls, 1)
        XCTAssertEqual(postCalls, 0)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testAutomaticDifferentPickUsesOwnerSpecificConflict() async throws {
        let cases: [(PickOwnerScope, PickConflictReason)] = [
            (.user("user-a"), .accountPickFound),
            (.guest, .serverWins),
        ]

        for (index, testCase) in cases.enumerated() {
            let context = makeContext()
            defer { context.cleanUp() }
            let record = try saveRecord(in: context.store, owner: testCase.0)
            let serverSelection = PickSelection(
                winnerDriverID: "piastri",
                tenthPlaceDriverID: "leclerc",
                dnfDriverID: "norris"
            )
            let api = GatedAPIClientSpy(responses: [
                "GET /api/picks": [.json(PickResponse(pick: pick(
                    raceID: record.id.raceID,
                    selection: serverSelection,
                    id: "server-\(index)"
                )))],
            ])
            let manager = SyncManager(api: api, clock: TestClock.fixed)

            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )

            XCTAssertEqual(
                context.store.record(id: record.id)?.syncState,
                .conflict(testCase.1)
            )
            XCTAssertEqual(context.store.record(id: record.id)?.selection, record.selection)
            XCTAssertEqual(
                context.store.authoritativePick(
                    for: record.id.raceID,
                    owner: .user("user-a")
                )?.id,
                "server-\(index)"
            )
            let postCalls = await api.calls(method: "POST", to: "/api/picks")
            XCTAssertEqual(postCalls, 0)
        }
    }

    func testAutomatic404PostsCapturedPayloadAndConfirms() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(responses: [
            "GET /api/picks": [.failure(.notFound)],
            "POST /api/picks": [.json(PickResponse(pick: pick(for: record)))],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["GET", "POST"])
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    func testAutomatic404Post423ReconcilesAuthorityAndExpiresCapturedRevision() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let authoritative = pick(
            raceID: record.id.raceID,
            selection: PickSelection(
                winnerDriverID: "piastri",
                tenthPlaceDriverID: "leclerc",
                dnfDriverID: "norris"
            ),
            id: "server-after-lock"
        )
        let api = GatedAPIClientSpy(responses: [
            "GET /api/picks": [
                .failure(.notFound),
                .json(PickResponse(pick: authoritative)),
            ],
            "POST /api/picks": [.failure(.serverError(423, "Locked"))],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["GET", "POST", "GET"])
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .expired)
        XCTAssertEqual(
            context.store.authoritativePick(
                for: record.id.raceID,
                owner: .user("user-a")
            )?.id,
            authoritative.id
        )
    }

    func testAutomatic401QueuesCurrentRevisionAndStopsBatch() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let first = try saveRecord(in: context.store, owner: .user("user-a"))
        let second = try saveRecord(
            in: context.store,
            race: RaceFixtures.upcoming,
            owner: .user("user-a")
        )
        let api = GatedAPIClientSpy(responses: [
            "GET /api/picks": [.failure(.unauthorized)],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "bad-token",
            localPickStore: context.store
        )

        let getCalls = await api.calls(to: "/api/picks")
        XCTAssertEqual(getCalls, 1)
        XCTAssertEqual(context.store.record(id: first.id)?.syncState, .queued)
        XCTAssertEqual(context.store.record(id: second.id)?.syncState, .queued)
    }

    func testAutomaticGet423AndNetworkFailuresStayQueuedWithoutPost() async throws {
        let failures: [APIError] = [
            .serverError(423, "Locked preflight"),
            .networkFailed(SyncManagerTestError.offline),
            .serverError(503, "Unavailable"),
        ]

        for failure in failures {
            let context = makeContext()
            defer { context.cleanUp() }
            let record = try saveRecord(in: context.store, owner: .user("user-a"))
            let api = GatedAPIClientSpy(responses: [
                "GET /api/picks": [.failure(failure)],
            ])
            let manager = SyncManager(api: api, clock: TestClock.fixed)

            await manager.resumeEligiblePicks(
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: context.store
            )

            let postCalls = await api.calls(method: "POST", to: "/api/picks")
            XCTAssertEqual(postCalls, 0)
            XCTAssertEqual(context.store.record(id: record.id)?.syncState, .queued)
        }
    }

    func testInitialSyncingPersistenceFailureMakesNoRequest() async throws {
        let persistence = ToggleablePickPersistence()
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let record = try saveRecord(in: store, owner: .user("user-a"))
        persistence.rejectsWrites = true
        let api = GatedAPIClientSpy(responses: [:])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )

        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.isEmpty)
        XCTAssertEqual(store.record(id: record.id)?.syncState, .queued)
    }

    func testConfirmationPersistenceFailureNeverReturnsSaved() async throws {
        let persistence = ToggleablePickPersistence()
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let record = try saveRecord(in: store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.json(PickResponse(pick: pick(for: record)))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let submission = Task {
            await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )
        persistence.rejectsWrites = true
        await api.releaseRequest(id: requestID)

        assertQueued(await submission.value)
        XCTAssertNotEqual(store.record(id: record.id)?.syncState, .confirmed)
    }

    func testConfirmationPersistenceFailureRetriesInProcessAfterStorageRecovers() async throws {
        let persistence = ToggleablePickPersistence()
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let record = try saveRecord(in: store, owner: .user("user-a"))
        let acceptedPick = pick(for: record)
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.json(PickResponse(pick: acceptedPick))],
                "GET /api/picks": [.json(PickResponse(pick: acceptedPick))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let submission = Task {
            await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )
        persistence.rejectsWrites = true
        await api.releaseRequest(id: requestID)
        assertQueued(await submission.value)
        XCTAssertEqual(
            store.record(id: record.id)?.syncState,
            .syncing(revision: record.revision, mode: .direct)
        )

        persistence.rejectsWrites = false
        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: store
        )

        XCTAssertEqual(store.record(id: record.id)?.syncState, .confirmed)
        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["POST", "GET"])
    }

    func testExpiryPersistenceFailureNeverReturnsExpired() async throws {
        let persistence = ToggleablePickPersistence()
        let store = LocalPickStore(
            persistence: persistence,
            clock: TestClock.fixed
        )
        let record = try saveRecord(in: store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(
            responses: [
                "POST /api/picks": [.failure(.serverError(423, "Locked"))],
            ],
            gatedKeys: ["POST /api/picks"]
        )
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let submission = Task {
            await manager.submitExplicit(
                id: record.id,
                revision: record.revision,
                currentUserID: "user-a",
                token: "token-a",
                localPickStore: store
            )
        }
        let requestID = await api.waitForRequest(
            method: "POST",
            to: "/api/picks",
            ordinal: 1
        )
        persistence.rejectsWrites = true
        await api.releaseRequest(id: requestID)

        assertQueued(await submission.value)
        XCTAssertNotEqual(store.record(id: record.id)?.syncState, .expired)
        XCTAssertEqual(store.expiredMigrationNoticeCount, 0)
    }

    func testDirect401QueuesDraftAndReturnsUnauthorized() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(responses: [
            "POST /api/picks": [.failure(.unauthorized)],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let result = await manager.submitExplicit(
            id: record.id,
            revision: record.revision,
            currentUserID: "user-a",
            token: "bad-token",
            localPickStore: context.store
        )

        guard case .unauthorized = result else {
            return XCTFail("Expected unauthorized")
        }
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .queued)
    }

    func testDirect423FollowUp401QueuesDraftAndReportsRejectedSession() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(responses: [
            "POST /api/picks": [.failure(.serverError(423, "Locked"))],
            "GET /api/picks": [.failure(.unauthorized)],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)
        var rejectedToken: String?
        manager.setUnauthorizedHandler { rejectedToken = $0 }
        _ = manager.beginSession(
            currentUserID: "user-a",
            token: "expired-token",
            localPickStore: context.store
        )

        let result = await manager.submitExplicit(
            id: record.id,
            revision: record.revision,
            currentUserID: "user-a",
            token: "expired-token",
            localPickStore: context.store
        )

        guard case .unauthorized = result else {
            return XCTFail("Expected unauthorized")
        }
        XCTAssertEqual(rejectedToken, "expired-token")
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .queued)
        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["POST", "GET"])
    }

    func testDirect423ReconcilesAuthorityWithoutRaisingMigrationNotice() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let authoritative = pick(
            raceID: record.id.raceID,
            selection: PickSelection(
                winnerDriverID: "piastri",
                tenthPlaceDriverID: "leclerc",
                dnfDriverID: "norris"
            ),
            id: "locked-server-pick"
        )
        let api = GatedAPIClientSpy(responses: [
            "POST /api/picks": [.failure(.serverError(423, "Locked"))],
            "GET /api/picks": [.json(PickResponse(pick: authoritative))],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let result = await manager.submitExplicit(
            id: record.id,
            revision: record.revision,
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        guard case .expired(let pick) = result else {
            return XCTFail("Expected expired")
        }
        XCTAssertEqual(pick?.id, authoritative.id)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .expired)
        XCTAssertEqual(
            context.store.authoritativePick(
                for: record.id.raceID,
                owner: .user("user-a")
            )?.id,
            authoritative.id
        )
        XCTAssertEqual(context.store.expiredMigrationNoticeCount, 0)
        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["POST", "GET"])
    }

    func testDirect409ReconcilesAuthorityAndMarksConflict() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let authoritative = pick(
            raceID: record.id.raceID,
            selection: PickSelection(
                winnerDriverID: "piastri",
                tenthPlaceDriverID: "leclerc",
                dnfDriverID: "norris"
            ),
            id: "conflicting-server-pick",
            version: "2026-07-24T18:34:00.000Z"
        )
        let api = GatedAPIClientSpy(responses: [
            "POST /api/picks": [.failure(.serverError(409, "Pick changed"))],
            "GET /api/picks": [.json(PickResponse(pick: authoritative))],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        let result = await manager.submitExplicit(
            id: record.id,
            revision: record.revision,
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )

        guard case .conflict(let pick) = result else {
            return XCTFail("Expected conflict")
        }
        XCTAssertEqual(pick?.id, authoritative.id)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .conflict(.serverWins))
        XCTAssertEqual(
            context.store.authoritativePick(
                for: record.id.raceID,
                owner: .user("user-a")
            )?.id,
            authoritative.id
        )
        let methods = await api.recordedRequests().map(\.method)
        XCTAssertEqual(methods, ["POST", "GET"])
    }

    func testKnownLockedRaceExpiresWithoutRequest() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(responses: [:])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store,
            races: [RaceFixtures.completedSpa]
        )

        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .expired)
        let requests = await api.recordedRequests()
        XCTAssertTrue(requests.isEmpty)
    }

    func testAccountQueueIsDormantForBAndResumesForA() async throws {
        let context = makeContext()
        defer { context.cleanUp() }
        let record = try saveRecord(in: context.store, owner: .user("user-a"))
        let api = GatedAPIClientSpy(responses: [
            "GET /api/picks": [.json(PickResponse(pick: pick(for: record)))],
        ])
        let manager = SyncManager(api: api, clock: TestClock.fixed)

        await manager.resumeEligiblePicks(
            currentUserID: "user-b",
            token: "token-b",
            localPickStore: context.store
        )
        let dormantRequests = await api.recordedRequests()
        XCTAssertTrue(dormantRequests.isEmpty)
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .queued)

        await manager.resumeEligiblePicks(
            currentUserID: "user-a",
            token: "token-a",
            localPickStore: context.store
        )
        XCTAssertEqual(context.store.record(id: record.id)?.syncState, .confirmed)
    }

    private func assertQueued(
        _ result: PickSyncResult,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard case .queued = result else {
            return XCTFail("Expected queued", file: file, line: line)
        }
    }

    private func body(
        from request: GatedAPIClientSpy.Request
    ) throws -> [String: Any] {
        let data = try XCTUnwrap(request.bodyData)
        return try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
    }

    private func makeContext() -> SyncDefaultsContext {
        let suiteName = "SyncManagerTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return SyncDefaultsContext(
            defaults: defaults,
            suiteName: suiteName,
            store: LocalPickStore(defaults: defaults, clock: TestClock.fixed)
        )
    }

    private func saveRecord(
        in store: LocalPickStore,
        race: Race = RaceFixtures.liveSpa,
        owner: PickOwnerScope,
        selection: PickSelection = PickSelection(
            winnerDriverID: "norris",
            tenthPlaceDriverID: "piastri",
            dnfDriverID: "leclerc"
        )
    ) throws -> LocalPickRecord {
        let result = store.save(
            selection: selection,
            race: race,
            owner: owner,
            now: RaceFixtures.now
        )
        guard case .saved(let record) = result else {
            throw SyncManagerTestError.expectedSavedRecord
        }
        return record
    }

    private func pick(for record: LocalPickRecord) -> Pick {
        pick(raceID: record.id.raceID, selection: record.selection, id: "pick-\(record.revision)")
    }

    private func pick(
        raceID: String,
        selection: PickSelection,
        id: String,
        version: String? = nil
    ) -> Pick {
        Pick(
            id: id,
            raceId: raceID,
            tenthPlaceDriverId: selection.tenthPlaceDriverID,
            winnerDriverId: selection.winnerDriverID,
            dnfDriverId: selection.dnfDriverID,
            version: version,
            lockedAt: nil,
            scoreBreakdown: nil
        )
    }
}

private struct SyncDefaultsContext {
    let defaults: UserDefaults
    let suiteName: String
    let store: LocalPickStore

    func cleanUp() {
        defaults.removePersistentDomain(forName: suiteName)
    }
}

private enum SyncManagerTestError: Error {
    case offline
    case expectedSavedRecord
}

@MainActor
private final class ToggleablePickPersistence: LocalPickPersisting {
    var rejectsWrites = false
    private var values: [String: Data] = [:]

    func data(forKey key: String) -> Data? {
        values[key]
    }

    func setData(_ data: Data, forKey key: String) {
        guard !rejectsWrites else { return }
        values[key] = data
    }

    func removeData(forKey key: String) {
        values[key] = nil
    }
}
