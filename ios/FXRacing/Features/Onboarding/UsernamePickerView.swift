import SwiftUI

struct UsernamePickerView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(GuestStore.self)  private var guestStore
    @State private var viewModel: UsernamePickerViewModel

    init(isChange: Bool = false) {
        _viewModel = State(initialValue: UsernamePickerViewModel(isChange: isChange))
    }
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: FXTheme.Spacing.xl) {

                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text(viewModel.isChange ? "Change your username" : "Pick your username")
                            .font(.system(size: 28, weight: .black))

                        Text("This is how other players will see you on the leaderboard.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        if viewModel.isChange {
                            Text("This is a one-time change — choose carefully.")
                                .font(.footnote).fontWeight(.semibold)
                                .foregroundStyle(FXTheme.Colors.danger)
                        } else {
                            Text("We've picked one for you — tap Confirm to keep it, or edit to choose your own.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Input
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("username", text: $viewModel.username)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .focused($fieldFocused)
                            .onChange(of: viewModel.username) { _, new in
                                viewModel.onUsernameChanged(new)
                            }
                            .padding(.horizontal, FXTheme.Spacing.md)
                            .padding(.vertical, 14)
                            .background(FXTheme.Colors.surface)
                            .cornerRadius(FXTheme.Radius.md)

                        if let format = viewModel.formatError {
                            Text(format)
                                .font(.caption)
                                .foregroundStyle(FXTheme.Colors.danger)
                        }

                        if let error = viewModel.errorMessage {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(FXTheme.Colors.danger)
                        }
                    }
                }
                .padding(FXTheme.Spacing.lg)
            }

            // Confirm button — pinned to bottom
            confirmButton
                .padding(.horizontal, FXTheme.Spacing.lg)
                .padding(.bottom, 32)
                .background(.ultraThinMaterial)
        }
        .task { await viewModel.prefillIfNeeded(guestStore: guestStore) }
    }

    // MARK: - Sub-views

    private var confirmButton: some View {
        // Keep the accent background while submitting so the white spinner is
        // clearly visible — App Review previously reported gray-on-gray as
        // looking unresponsive.
        let isActive = viewModel.canSubmit || viewModel.isSubmitting

        return Button {
            fieldFocused = false
            Task { await viewModel.submit(authManager: authManager) }
        } label: {
            Group {
                if viewModel.isSubmitting {
                    ProgressView().tint(FXTheme.Colors.onAccent)
                } else {
                    Text("Confirm").fontWeight(.bold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(isActive ? FXTheme.Colors.accent : Color.secondary.opacity(0.25))
            .foregroundStyle(isActive ? FXTheme.Colors.onAccent : .secondary)
            .cornerRadius(FXTheme.Radius.md)
        }
        .disabled(!viewModel.canSubmit || viewModel.isSubmitting)
    }
}
