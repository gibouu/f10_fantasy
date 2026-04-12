import Foundation
import AuthenticationServices

@Observable
@MainActor
final class SignInViewModel {
    var isLoading = false
    var errorMessage: String?

    func handleAppleResult(
        _ result: Result<ASAuthorization, Error>,
        authManager: AuthManager
    ) async {
        switch result {
        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData  = credential.identityToken,
                let idToken    = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = "Sign in failed. Please try again."
                return
            }

            isLoading = true
            errorMessage = nil
            defer { isLoading = false }

            do {
                try await authManager.signInWithApple(idToken: idToken)
            } catch {
                errorMessage = error.localizedDescription
            }

        case .failure(let error as ASAuthorizationError) where error.code == .canceled:
            break // User dismissed sheet — no error to surface

        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }
}
