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
            fxLog(.auth, "restoreSession: no keychain token → guest")
            state = .unauthenticated
            return
        }
        do {
            let user: User = try await api.request(.me, token: token)
            fxLog(.auth, "restoreSession: authenticated user=\(user.id) usernameSet=\(user.usernameSet)")
            state = .authenticated(user)
        } catch APIError.unauthorized {
            fxWarn(.auth, "restoreSession: token rejected (401) → clearing keychain")
            KeychainService.deleteToken()
            state = .unauthenticated
        } catch {
            fxWarn(.auth, "restoreSession: \(error.localizedDescription) → falling back to guest")
            state = .unauthenticated
        }
    }

    // MARK: - Sign in

    func signInWithApple(idToken: String) async throws {
        fxLog(.auth, "signInWithApple: exchanging Apple id_token")
        let exchange: ExchangeResponse = try await api.request(
            .mobileExchange(provider: "apple", idToken: idToken)
        )
        try KeychainService.saveToken(exchange.accessToken)
        fxLog(.auth, "signInWithApple: token issued, userId=\(exchange.userId) usernameSet=\(exchange.usernameSet)")

        let user: User = try await api.request(.me, token: exchange.accessToken)
        state = .authenticated(user)
        fxLog(.auth, "signInWithApple: state=authenticated user=\(user.id)")

        // Migrate any guest picks in the background — don't block sign-in completion
        // so the caller can dismiss sheets / transition views before migration finishes.
        if let store = localPickStore {
            Task { await syncManager.migrateGuestPicks(token: exchange.accessToken, localPickStore: store) }
        }

        // Offer the guest draft username as a prefill (caller reads guestStore if needed)
        // The guestStore.localUsername is intentionally NOT cleared here — the
        // UsernamePickerView reads it as a prefill suggestion.
    }

    // MARK: - Onboarding

    func setUsername(_ username: String) async throws {
        guard let token = KeychainService.loadToken() else { throw APIError.unauthorized }
        let response: UsernameSetResponse = try await api.request(.setUsername(username), token: token)
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
        guard let token = KeychainService.loadToken() else { throw APIError.unauthorized }
        let response: UsernameSetResponse = try await api.request(.changeUsername(username), token: token)
        if case .authenticated(let user) = state {
            state = .authenticated(user.withUsernameChanged(response.username))
        }
    }

    func setFavoriteTeam(_ slug: String?) async throws {
        guard let token = KeychainService.loadToken() else { throw APIError.unauthorized }
        let _: TeamResponse = try await api.request(.setFavoriteTeam(slug), token: token)
        let user: User = try await api.request(.me, token: token)
        state = .authenticated(user)
    }

    // MARK: - Sign out

    func signOut() {
        KeychainService.deleteToken()
        state = .unauthenticated
    }

    // MARK: - Account deletion

    func deleteAccount() async throws {
        guard let token = KeychainService.loadToken() else { throw APIError.unauthorized }
        let _: DeleteAccountResponse = try await api.request(.deleteAccount, token: token)
        signOut()
    }


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

private struct TeamResponse: Decodable, Sendable {
    let ok: Bool
}

private struct DeleteAccountResponse: Decodable, Sendable {
    let ok: Bool
}
