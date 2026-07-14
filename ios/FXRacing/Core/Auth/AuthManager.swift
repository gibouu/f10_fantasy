import Foundation

@Observable
@MainActor
final class AuthManager {

    enum State: Equatable {
        case unknown          // App just launched; session check in progress
        case unauthenticated  // No token — guest mode
        case accountUnavailable
        case authenticated(User)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.unknown, .unknown),
                 (.unauthenticated, .unauthenticated),
                 (.accountUnavailable, .accountUnavailable):
                return true
            case (.authenticated(let a), .authenticated(let b)):
                return a.id == b.id
            default:
                return false
            }
        }
    }

    private(set) var state: State = .unknown

    private let api: any APIRequesting
    private let tokenStore: any TokenStoring
    private let syncManager: SyncManager
    private var sessionGeneration = UUID()

    init(
        api: any APIRequesting = APIClient(),
        tokenStore: any TokenStoring = KeychainTokenStore(),
        syncManager: SyncManager = SyncManager()
    ) {
        self.api = api
        self.tokenStore = tokenStore
        self.syncManager = syncManager
    }

    // Injected at launch — set before restoreSession() is called.
    var localPickStore: LocalPickStore?
    var guestStore: GuestStore?

    // MARK: - Session lifecycle

    func restoreSession(races: [Race] = []) async {
        let generation = advanceSessionGeneration()
        guard let token = tokenStore.loadToken() else {
            fxLog(.auth, "restoreSession: no keychain token → guest")
            state = .unauthenticated
            return
        }
        do {
            let user: User = try await api.request(.me, token: token)
            guard isCurrent(generation) else { return }
            fxLog(.auth, "restoreSession: authenticated user=\(user.id) usernameSet=\(user.usernameSet)")
            state = .authenticated(user)
            await resumeEligiblePicks(
                userID: user.id,
                token: token,
                races: races
            )
        } catch APIError.unauthorized {
            guard isCurrent(generation) else { return }
            fxWarn(.auth, "restoreSession: token rejected (401) → clearing keychain")
            tokenStore.deleteToken()
            state = .unauthenticated
        } catch {
            guard isCurrent(generation) else { return }
            fxWarn(.auth, "restoreSession: \(error.localizedDescription) → account temporarily unavailable")
            state = .accountUnavailable
        }
    }

    func retrySession(races: [Race] = []) async {
        await restoreSession(races: races)
    }

    func handleForeground(races: [Race] = []) async {
        switch state {
        case .unknown, .accountUnavailable:
            await restoreSession(races: races)
        case .unauthenticated:
            return
        case .authenticated(let user):
            guard let token = tokenStore.loadToken() else {
                _ = advanceSessionGeneration()
                state = .unauthenticated
                return
            }
            await resumeEligiblePicks(
                userID: user.id,
                token: token,
                races: races
            )
        }
    }

    // MARK: - Sign in

    func signInWithApple(idToken: String) async throws {
        let generation = advanceSessionGeneration()
        fxLog(.auth, "signInWithApple: exchanging Apple id_token")
        let exchange: ExchangeResponse = try await api.request(
            .mobileExchange(provider: "apple", idToken: idToken),
            token: nil
        )
        try requireCurrent(generation)
        try tokenStore.saveToken(exchange.accessToken)
        fxLog(.auth, "signInWithApple: token issued, userId=\(exchange.userId) usernameSet=\(exchange.usernameSet)")

        // Sign-in succeeds the moment the exchange returns — the token is
        // valid and saved. Try to enrich with /me, but if that call fails
        // (e.g. transient 401 from a stale revocation snapshot, brief
        // network blip), fall back to a User constructed from the exchange
        // response. This guarantees the user always lands inside the app
        // after a successful Apple authorization, instead of seeing the
        // sign-in sheet error out post-authorization.
        let user: User
        do {
            let fetchedUser: User = try await api.request(
                .me,
                token: exchange.accessToken
            )
            try requireCurrent(generation)
            user = fetchedUser
        } catch {
            try requireCurrent(generation)
            fxWarn(.auth, "signInWithApple: /me failed (\(error.localizedDescription)) — proceeding with exchange response")
            user = User(
                id: exchange.userId,
                name: nil,
                email: nil,
                avatarUrl: nil,
                publicUsername: exchange.publicUsername,
                usernameSet: exchange.usernameSet,
                usernameChangeUsed: false,
                favoriteTeamSlug: nil,
                tutorialDismissedAt: nil,
                createdAt: Date()
            )
        }
        try requireCurrent(generation)
        state = .authenticated(user)
        fxLog(.auth, "signInWithApple: state=authenticated user=\(user.id)")

        // Migrate any guest picks in the background — don't block sign-in completion
        // so the caller can dismiss sheets / transition views before migration finishes.
        if let store = localPickStore {
            Task {
                await syncManager.resumeEligiblePicks(
                    currentUserID: user.id,
                    token: exchange.accessToken,
                    localPickStore: store
                )
            }
        }

        // Offer the guest draft username as a prefill (caller reads guestStore if needed)
        // The guestStore.localUsername is intentionally NOT cleared here — the
        // UsernamePickerView reads it as a prefill suggestion.
    }

    // MARK: - Onboarding

    func setUsername(_ username: String) async throws {
        let context = try authenticatedContext()
        let response: UsernameSetResponse = try await api.request(
            .setUsername(username),
            token: context.token
        )
        try requireCurrent(context)
        // Optimistic local update — server has accepted the username, so flip
        // RootView immediately without waiting for a second GET /me roundtrip.
        // The previous double-roundtrip kept the spinner visible long enough
        // that App Review reported it as "unresponsive".
        if case .authenticated(let user) = state {
            state = .authenticated(user.withUsernameSet(response.username))
        }
        guestStore?.clearUsername()
    }

    func changeUsername(_ username: String) async throws {
        let context = try authenticatedContext()
        let response: UsernameSetResponse = try await api.request(
            .changeUsername(username),
            token: context.token
        )
        try requireCurrent(context)
        if case .authenticated(let user) = state {
            state = .authenticated(user.withUsernameChanged(response.username))
        }
    }

    func setFavoriteTeam(_ slug: String?) async throws {
        let context = try authenticatedContext()
        let _: TeamResponse = try await api.request(
            .setFavoriteTeam(slug),
            token: context.token
        )
        try requireCurrent(context)
        let user: User = try await api.request(.me, token: context.token)
        try requireCurrent(context)
        state = .authenticated(user)
    }

    // MARK: - Sign out

    func signOut() {
        _ = advanceSessionGeneration()
        tokenStore.deleteToken()
        state = .unauthenticated
    }

    // MARK: - Account deletion

    func deleteAccount() async throws {
        let context = try authenticatedContext()
        let _: DeleteAccountResponse = try await api.request(
            .deleteAccount,
            token: context.token
        )
        try requireCurrent(context)
        signOut()
    }


    // MARK: - Convenience

    var accessToken: String? {
        guard isAuthenticated else { return nil }
        return tokenStore.loadToken()
    }

    var isAuthenticated: Bool {
        if case .authenticated = state { return true }
        return false
    }

    var authenticatedUser: User? {
        if case .authenticated(let user) = state { return user }
        return nil
    }

    private struct AuthenticatedContext {
        let userID: String
        let token: String
        let generation: UUID
    }

    private func authenticatedContext() throws -> AuthenticatedContext {
        guard case .authenticated(let user) = state,
              let token = tokenStore.loadToken()
        else { throw APIError.unauthorized }
        return AuthenticatedContext(
            userID: user.id,
            token: token,
            generation: sessionGeneration
        )
    }

    private func advanceSessionGeneration() -> UUID {
        let generation = UUID()
        sessionGeneration = generation
        return generation
    }

    private func isCurrent(_ generation: UUID) -> Bool {
        sessionGeneration == generation
    }

    private func requireCurrent(_ generation: UUID) throws {
        guard isCurrent(generation) else { throw CancellationError() }
    }

    private func requireCurrent(_ context: AuthenticatedContext) throws {
        guard isCurrent(context.generation),
              case .authenticated(let user) = state,
              user.id == context.userID
        else { throw CancellationError() }
    }

    private func resumeEligiblePicks(
        userID: String,
        token: String,
        races: [Race]
    ) async {
        guard let localPickStore else { return }
        await syncManager.resumeEligiblePicks(
            currentUserID: userID,
            token: token,
            localPickStore: localPickStore,
            races: races
        )
    }
}

// MARK: - Private response shapes

private struct ExchangeResponse: Decodable, Sendable {
    let accessToken: String
    let userId: String
    let usernameSet: Bool
    let publicUsername: String?
}

private struct UsernameSetResponse: Decodable, Sendable {
    let ok: Bool
    let username: String
}

private struct TeamResponse: Decodable, Sendable {
    let ok: Bool
}

private struct DeleteAccountResponse: Decodable, Sendable {
    let ok: Bool
}
