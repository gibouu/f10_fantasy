import XCTest
@testable import FXRacing

@MainActor
final class AuthManagerTests: XCTestCase {
    func testRestoreWithoutTokenSignsOutWithoutRequest() async {
        let api = GatedAPIClientSpy(responses: [:])
        let tokenStore = TokenStoreSpy()
        let manager = makeManager(api: api, tokenStore: tokenStore)

        await manager.restoreSession()

        let requests = await api.recordedRequests()
        XCTAssertEqual(manager.state, .unauthenticated)
        XCTAssertEqual(tokenStore.operations, [.load])
        XCTAssertTrue(requests.isEmpty)
    }

    func testRestore200AuthenticatesBeforeResumingEligibleQueues() async throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let user = makeUser()
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/users/me": [.json(user)],
                "GET /api/picks": [.failure(.unauthorized)],
            ],
            gatedKeys: ["GET /api/picks"]
        )
        let tokenStore = TokenStoreSpy(token: "token-a")
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        let manager = AuthManager(
            api: api,
            tokenStore: tokenStore,
            syncManager: syncManager
        )
        manager.localPickStore = context.store
        _ = try saveRecord(in: context.store, owner: .user(user.id))

        let restore = Task { await manager.restoreSession() }
        await api.waitForCalls(to: "/api/picks", count: 1)
        let meCalls = await api.calls(to: "/api/users/me")

        XCTAssertEqual(manager.state, .authenticated(user))
        XCTAssertEqual(meCalls, 1)

        await api.releaseRequests(to: "/api/picks")
        await restore.value
        XCTAssertEqual(tokenStore.operations, [.load])
    }

    func testRestore401DeletesTokenAndPreservesLocalRecords() async throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let api = GatedAPIClientSpy(responses: [
            "GET /api/users/me": [.failure(.unauthorized)],
        ])
        let tokenStore = TokenStoreSpy(token: "rejected-token")
        let manager = makeManager(
            api: api,
            tokenStore: tokenStore,
            localPickStore: context.store
        )
        let draft = try saveRecord(in: context.store, owner: .guest)

        await manager.restoreSession()
        let meCalls = await api.calls(to: "/api/users/me")

        XCTAssertEqual(manager.state, .unauthenticated)
        XCTAssertNil(tokenStore.token)
        XCTAssertEqual(tokenStore.operations, [.load, .delete])
        XCTAssertEqual(context.store.record(id: draft.id), draft)
        XCTAssertEqual(meCalls, 1)
    }

    func testRestoreNetworkAndServerFailuresRetainTokenAndDisablePrivateAccess() async {
        let failures: [APIError] = [
            .networkFailed(AuthManagerTestError.offline),
            .serverError(503, "maintenance"),
        ]

        for (index, failure) in failures.enumerated() {
            let api = GatedAPIClientSpy(responses: [
                "GET /api/users/me": [.failure(failure)],
            ])
            let token = "retained-\(index)"
            let tokenStore = TokenStoreSpy(token: token)
            let manager = makeManager(api: api, tokenStore: tokenStore)

            await manager.restoreSession()
            let meCalls = await api.calls(to: "/api/users/me")

            XCTAssertEqual(manager.state, .accountUnavailable)
            XCTAssertEqual(tokenStore.token, token)
            XCTAssertEqual(tokenStore.operations, [.load])
            XCTAssertNil(manager.accessToken)
            XCTAssertFalse(manager.isAuthenticated)
            XCTAssertNil(manager.authenticatedUser)
            XCTAssertEqual(meCalls, 1)
        }
    }

    func testAccountUnavailableBlocksEveryPrivateMutationWithoutRequest() async {
        let api = GatedAPIClientSpy(responses: [
            "GET /api/users/me": [.failure(.networkFailed(AuthManagerTestError.offline))],
        ])
        let tokenStore = TokenStoreSpy(token: "retained-token")
        let manager = makeManager(api: api, tokenStore: tokenStore)

        await manager.restoreSession()
        let requestsBeforeMutations = await api.recordedRequests()

        await assertUnauthorized { try await manager.setUsername("rookie") }
        await assertUnauthorized { try await manager.changeUsername("veteran") }
        await assertUnauthorized { try await manager.setFavoriteTeam("ferrari") }
        await assertUnauthorized { try await manager.deleteAccount() }

        let requestsAfterMutations = await api.recordedRequests()
        XCTAssertEqual(manager.state, .accountUnavailable)
        XCTAssertEqual(requestsAfterMutations.count, requestsBeforeMutations.count)
        XCTAssertEqual(tokenStore.token, "retained-token")
        XCTAssertEqual(tokenStore.operations, [.load])
    }

    func testRetryFromAccountUnavailableAuthenticatesAndResumesQueues() async throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let user = makeUser()
        let api = GatedAPIClientSpy(responses: [
            "GET /api/users/me": [
                .failure(.networkFailed(AuthManagerTestError.offline)),
                .json(user),
            ],
            "GET /api/picks": [.failure(.unauthorized)],
        ])
        let tokenStore = TokenStoreSpy(token: "token-a")
        let manager = makeManager(
            api: api,
            tokenStore: tokenStore,
            localPickStore: context.store
        )
        _ = try saveRecord(in: context.store, owner: .user(user.id))

        await manager.restoreSession()
        let picksBeforeRetry = await api.calls(to: "/api/picks")
        XCTAssertEqual(manager.state, .accountUnavailable)
        XCTAssertEqual(picksBeforeRetry, 0)

        await manager.retrySession()
        let meCalls = await api.calls(to: "/api/users/me")
        let pickCalls = await api.calls(to: "/api/picks")

        XCTAssertEqual(manager.state, .authenticated(user))
        XCTAssertEqual(meCalls, 2)
        XCTAssertEqual(pickCalls, 1)
        XCTAssertEqual(tokenStore.operations, [.load, .load])
    }

    func testForegroundAuthenticatedResumesWithoutAnotherMeRequest() async throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let user = makeUser()
        let api = GatedAPIClientSpy(responses: [
            "GET /api/users/me": [.json(user)],
            "GET /api/picks": [.failure(.unauthorized)],
        ])
        let tokenStore = TokenStoreSpy(token: "token-a")
        let manager = makeManager(
            api: api,
            tokenStore: tokenStore,
            localPickStore: context.store
        )

        await manager.restoreSession()
        _ = try saveRecord(in: context.store, owner: .user(user.id))

        await manager.handleForeground()
        let meCalls = await api.calls(to: "/api/users/me")
        let pickCalls = await api.calls(to: "/api/picks")

        XCTAssertEqual(manager.state, .authenticated(user))
        XCTAssertEqual(meCalls, 1)
        XCTAssertEqual(pickCalls, 1)
        XCTAssertEqual(tokenStore.operations, [.load, .load])
    }

    func testSuccessfulExchangeStoresTokenWhenMeFallbackFails() async throws {
        let exchangeJSON = Data(
            #"{"accessToken":"exchange-token","userId":"exchange-user","usernameSet":false,"publicUsername":"rookie"}"#.utf8
        )
        let api = GatedAPIClientSpy(responses: [
            "POST /api/auth/mobile/exchange": [.data(exchangeJSON)],
            "GET /api/users/me": [.failure(.networkFailed(AuthManagerTestError.offline))],
        ])
        let tokenStore = TokenStoreSpy()
        let manager = makeManager(api: api, tokenStore: tokenStore)

        try await manager.signInWithApple(idToken: "apple-id-token")

        let requests = await api.recordedRequests()
        XCTAssertEqual(manager.authenticatedUser?.id, "exchange-user")
        XCTAssertEqual(manager.authenticatedUser?.publicUsername, "rookie")
        XCTAssertEqual(tokenStore.token, "exchange-token")
        XCTAssertEqual(tokenStore.operations, [.save("exchange-token")])
        XCTAssertEqual(
            requests.map { "\($0.method) \($0.path)" },
            ["POST /api/auth/mobile/exchange", "GET /api/users/me"]
        )
        XCTAssertNil(requests.first?.token)
        XCTAssertEqual(requests.last?.token, "exchange-token")
    }

    func testSignOutDeletesInjectedTokenWithoutRemovingDrafts() async throws {
        let context = makeDefaults()
        defer { context.cleanUp() }
        let user = makeUser()
        let api = GatedAPIClientSpy(responses: [
            "GET /api/users/me": [.json(user)],
        ])
        let tokenStore = TokenStoreSpy(token: "token-a")
        let manager = makeManager(
            api: api,
            tokenStore: tokenStore,
            localPickStore: context.store
        )
        await manager.restoreSession()
        let guestDraft = try saveRecord(
            in: context.store,
            race: RaceFixtures.liveSpa,
            owner: .guest
        )
        let accountDraft = try saveRecord(
            in: context.store,
            race: RaceFixtures.upcoming,
            owner: .user(user.id)
        )

        manager.signOut()

        XCTAssertEqual(manager.state, .unauthenticated)
        XCTAssertNil(tokenStore.token)
        XCTAssertEqual(tokenStore.operations, [.load, .delete])
        XCTAssertEqual(context.store.record(id: guestDraft.id), guestDraft)
        XCTAssertEqual(context.store.record(id: accountDraft.id), accountDraft)
    }

    func testStaleRestore401CannotDeleteANewerSignInToken() async throws {
        let newUser = makeUser(id: "user-new")
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/users/me": [
                    .failure(.unauthorized),
                    .json(newUser),
                ],
                "POST /api/auth/mobile/exchange": [
                    .data(exchangeData(
                        token: "token-new",
                        userID: newUser.id,
                        username: newUser.publicUsername
                    )),
                ],
            ],
            gatedKeys: ["GET /api/users/me"]
        )
        let tokenStore = TokenStoreSpy(token: "token-old")
        let manager = makeManager(api: api, tokenStore: tokenStore)

        let staleRestore = Task { await manager.restoreSession() }
        let oldRequestID = await api.waitForRequest(
            to: "/api/users/me",
            ordinal: 1
        )
        let signIn = Task {
            try await manager.signInWithApple(idToken: "new-apple-token")
        }
        let newRequestID = await api.waitForRequest(
            to: "/api/users/me",
            ordinal: 2
        )
        await api.releaseRequest(id: newRequestID)
        try await signIn.value

        await api.releaseRequest(id: oldRequestID)
        await staleRestore.value

        XCTAssertEqual(manager.state, .authenticated(newUser))
        XCTAssertEqual(tokenStore.token, "token-new")
        XCTAssertEqual(
            tokenStore.operations,
            [.load, .save("token-new")]
        )
    }

    func testStaleRestore200CannotReauthenticateAfterSignOut() async {
        let oldUser = makeUser(id: "user-old")
        let api = GatedAPIClientSpy(
            responses: ["GET /api/users/me": [.json(oldUser)]],
            gatedKeys: ["GET /api/users/me"]
        )
        let tokenStore = TokenStoreSpy(token: "token-old")
        let manager = makeManager(api: api, tokenStore: tokenStore)

        let restore = Task { await manager.restoreSession() }
        let requestID = await api.waitForRequest(to: "/api/users/me", ordinal: 1)
        manager.signOut()
        await api.releaseRequest(id: requestID)
        await restore.value

        XCTAssertEqual(manager.state, .unauthenticated)
        XCTAssertNil(tokenStore.token)
        XCTAssertEqual(tokenStore.operations, [.load, .delete])
    }

    func testStaleDeleteCompletionCannotSignOutANewerAccount() async throws {
        let oldUser = makeUser(id: "user-old")
        let newUser = makeUser(id: "user-new")
        let api = GatedAPIClientSpy(
            responses: [
                "GET /api/users/me": [.json(oldUser), .json(newUser)],
                "DELETE /api/account": [.data(Data(#"{"ok":true}"#.utf8))],
                "POST /api/auth/mobile/exchange": [
                    .data(exchangeData(
                        token: "token-new",
                        userID: newUser.id,
                        username: newUser.publicUsername
                    )),
                ],
            ],
            gatedKeys: ["DELETE /api/account"]
        )
        let tokenStore = TokenStoreSpy(token: "token-old")
        let manager = makeManager(api: api, tokenStore: tokenStore)
        await manager.restoreSession()

        let deletion = Task { try await manager.deleteAccount() }
        let deleteRequestID = await api.waitForRequest(
            method: "DELETE",
            to: "/api/account",
            ordinal: 1
        )
        try await manager.signInWithApple(idToken: "new-apple-token")
        await api.releaseRequest(id: deleteRequestID)
        _ = try? await deletion.value

        XCTAssertEqual(manager.state, .authenticated(newUser))
        XCTAssertEqual(tokenStore.token, "token-new")
        XCTAssertEqual(
            tokenStore.operations,
            [.load, .load, .save("token-new")]
        )
    }

    private func makeManager(
        api: GatedAPIClientSpy,
        tokenStore: TokenStoreSpy,
        localPickStore: LocalPickStore? = nil
    ) -> AuthManager {
        let syncManager = SyncManager(api: api, clock: TestClock.fixed)
        let manager = AuthManager(
            api: api,
            tokenStore: tokenStore,
            syncManager: syncManager
        )
        manager.localPickStore = localPickStore
        return manager
    }

    private func makeUser(id: String = "user-a") -> User {
        User(
            id: id,
            name: "Driver A",
            email: "driver@example.com",
            avatarUrl: nil,
            publicUsername: "driver-a",
            usernameSet: true,
            usernameChangeUsed: false,
            favoriteTeamSlug: "ferrari",
            tutorialDismissedAt: nil,
            createdAt: RaceFixtures.now
        )
    }

    private func exchangeData(
        token: String,
        userID: String,
        username: String?
    ) -> Data {
        let usernameValue = username.map { "\"\($0)\"" } ?? "null"
        return Data(
            """
            {"accessToken":"\(token)","userId":"\(userID)","usernameSet":true,"publicUsername":\(usernameValue)}
            """.utf8
        )
    }

    private func makeDefaults() -> AuthDefaultsContext {
        let suiteName = "AuthManagerTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return AuthDefaultsContext(
            defaults: defaults,
            suiteName: suiteName,
            store: LocalPickStore(defaults: defaults, clock: TestClock.fixed)
        )
    }

    private func saveRecord(
        in store: LocalPickStore,
        race: Race = RaceFixtures.liveSpa,
        owner: PickOwnerScope
    ) throws -> LocalPickRecord {
        let result = store.save(
            selection: PickSelection(
                winnerDriverID: "norris",
                tenthPlaceDriverID: "piastri",
                dnfDriverID: "leclerc"
            ),
            race: race,
            owner: owner,
            now: RaceFixtures.now
        )
        guard case .saved(let record) = result else {
            throw AuthManagerTestError.expectedSavedRecord
        }
        return record
    }

    private func assertUnauthorized(
        _ operation: () async throws -> Void,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            try await operation()
            XCTFail("Expected APIError.unauthorized", file: file, line: line)
        } catch APIError.unauthorized {
            return
        } catch {
            XCTFail("Expected APIError.unauthorized, got \(error)", file: file, line: line)
        }
    }
}

private struct AuthDefaultsContext {
    let defaults: UserDefaults
    let suiteName: String
    let store: LocalPickStore

    func cleanUp() {
        defaults.removePersistentDomain(forName: suiteName)
    }
}

private enum AuthManagerTestError: Error {
    case offline
    case expectedSavedRecord
}
