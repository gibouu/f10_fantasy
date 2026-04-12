import Foundation

@Observable
@MainActor
final class AuthManager {

    enum State: Equatable {
        case unknown          // App just launched; session check in progress
        case unauthenticated  // No token — guest mode
        case authenticated(User)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.unknown, .unknown),
                 (.unauthenticated, .unauthenticated):
                return true
            case (.authenticated(let a), .authenticated(let b)):
                return a.id == b.id
            default:
                return false
            }
        }
    }

    private(set) var state: State = .unknown

    private let api = APIClient()
    private let syncManager = SyncManager()

    // Injected at launch — set before restoreSession() is called.
    var localPickStore: LocalPickStore?
    var guestStore: GuestStore?

    // MARK: - Session lifecycle

    func restoreSession() async {
        guard let token = KeychainService.loadToken() else {
            state = .unauthenticated
            return
        }
        do {
            let user: User = try await api.request(.me, token: token)
            state = .authenticated(user)
        } catch APIError.unauthorized {
            KeychainService.deleteToken()
            state = .unauthenticated
        } catch {
            // Network unavailable on launch — fall through to guest mode.
            state = .unauthenticated
        }
    }

    // MARK: - Sign in

    func signInWithApple(idToken: String) async throws {
        let exchange: ExchangeResponse = try await api.request(
            .mobileExchange(provider: "apple", idToken: idToken)
        )
        try KeychainService.saveToken(exchange.accessToken)

        let user: User = try await api.request(.me, token: exchange.accessToken)
        state = .authenticated(user)

        // Migrate any guest picks that were saved locally
        if let store = localPickStore {
            await syncManager.migrateGuestPicks(token: exchange.accessToken, localPickStore: store)
        }

        // Offer the guest draft username as a prefill (caller reads guestStore if needed)
        // The guestStore.localUsername is intentionally NOT cleared here — the
        // UsernamePickerView reads it as a prefill suggestion.
    }

    // MARK: - Onboarding

    func setUsername(_ username: String) async throws {
        guard let token = KeychainService.loadToken() else { throw APIError.unauthorized }
        let _: UsernameSetResponse = try await api.request(.setUsername(username), token: token)
        let user: User = try await api.request(.me, token: token)
        state = .authenticated(user)
        guestStore?.clearUsername()
    }

    func changeUsername(_ username: String) async throws {
        guard let token = KeychainService.loadToken() else { throw APIError.unauthorized }
        let _: UsernameSetResponse = try await api.request(.changeUsername(username), token: token)
        let user: User = try await api.request(.me, token: token)
        state = .authenticated(user)
    }

    // MARK: - Sign out

    func signOut() {
        KeychainService.deleteToken()
        state = .unauthenticated
    }

    // MARK: - Dev helpers (DEBUG only)

    #if DEBUG
    /// Bypasses real Apple sign-in for simulator/UI testing.
    /// Sets a mock authenticated state without a real token.
    func signInAsDev() {
        state = .authenticated(User(
            id: "dev-user-001",
            name: "Dev Player",
            email: "dev@fxracing.ca",
            avatarUrl: nil,
            publicUsername: "DevPlayer",
            usernameSet: true,
            usernameChangeUsed: false,
            favoriteTeamSlug: "ferrari",
            tutorialDismissedAt: nil,
            createdAt: Date()
        ))
    }
    #endif

    // MARK: - Convenience

    var accessToken: String? { KeychainService.loadToken() }

    var isAuthenticated: Bool {
        if case .authenticated = state { return true }
        return false
    }

    var authenticatedUser: User? {
        if case .authenticated(let user) = state { return user }
        return nil
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
