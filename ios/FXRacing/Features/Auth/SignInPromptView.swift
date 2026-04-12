import SwiftUI
import AuthenticationServices

/// Compact sign-in sheet with a contextual reason string.
/// Used for auth-gating actions like "Add Friend" or "Sync Picks".
struct SignInPromptView: View {
    let reason: String
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @State private var vm = SignInViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 12) {
                    Image(systemName: "person.badge.shield.checkmark.fill")
                        .font(.system(size: 52))
                        .foregroundStyle(FXTheme.Colors.accent)

                    Text("Sign In Required")
                        .font(.title2.weight(.bold))

                    Text(reason)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, FXTheme.Spacing.xl)
                }

                Spacer()

                VStack(spacing: 12) {
                    if let error = vm.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(FXTheme.Colors.danger)
                            .multilineTextAlignment(.center)
                    }

                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        Task {
                            await vm.handleAppleResult(result, authManager: authManager)
                            if authManager.isAuthenticated { dismiss() }
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 54)
                    .cornerRadius(FXTheme.Radius.md)
                    .disabled(vm.isLoading)
                    .overlay {
                        if vm.isLoading {
                            RoundedRectangle(cornerRadius: FXTheme.Radius.md)
                                .fill(.black.opacity(0.35))
                            ProgressView().tint(.white)
                        }
                    }

                }
                .padding(.horizontal, FXTheme.Spacing.lg)
                .padding(.bottom, 48)
            }
            .navigationTitle("Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
