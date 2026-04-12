import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var viewModel = SignInViewModel()

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // ── Branding ──────────────────────────────────────────────
                VStack(spacing: 12) {
                    Image(systemName: "flag.2.crossed.fill")
                        .font(.system(size: 64, weight: .bold))
                        .foregroundStyle(FXTheme.Colors.accent)

                    Text("FX Racing")
                        .font(.system(size: 36, weight: .black))
                        .foregroundStyle(.primary)

                    Text("Fantasy Formula 10")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // ── Auth options ──────────────────────────────────────────
                VStack(spacing: 16) {
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(FXTheme.Colors.danger)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }

                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        Task {
                            await viewModel.handleAppleResult(result, authManager: authManager)
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 54)
                    .cornerRadius(FXTheme.Radius.md)
                    .disabled(viewModel.isLoading)
                    .overlay {
                        if viewModel.isLoading {
                            RoundedRectangle(cornerRadius: FXTheme.Radius.md)
                                .fill(.black.opacity(0.35))
                            ProgressView().tint(.white)
                        }
                    }

                }
                .padding(.horizontal, FXTheme.Spacing.lg)
                .padding(.bottom, 48)
            }
        }
    }
}
