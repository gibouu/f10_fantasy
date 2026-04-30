import SwiftUI

struct UsernamePickerView: View {
    @Environment(AuthManager.self) private var authManager
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
                            Text("You may only change your username once after this.")
                                .font(.footnote).fontWeight(.semibold)
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Input
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            TextField("username", text: $viewModel.username)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                                .focused($fieldFocused)
                                .onChange(of: viewModel.username) { _, new in
                                    viewModel.onUsernameChanged(new)
                                }

                            availabilityIcon
                        }
                        .padding(.horizontal, FXTheme.Spacing.md)
                        .padding(.vertical, 14)
                        .background(FXTheme.Colors.surface)
                        .cornerRadius(FXTheme.Radius.md)

                        availabilityCaption
                    }

                    // Suggestions
                    if !viewModel.suggestions.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Suggestions")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)
                                .tracking(1)

                            HStack(spacing: 8) {
                                ForEach(viewModel.suggestions, id: \.self) { suggestion in
                                    Button(suggestion) {
                                        viewModel.username = suggestion
                                        viewModel.onUsernameChanged(suggestion)
                                        fieldFocused = false
                                    }
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .background(FXTheme.Colors.surface)
                                    .cornerRadius(FXTheme.Radius.sm)
                                    .foregroundStyle(.primary)
                                }
                            }
                        }
                    }

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(FXTheme.Colors.danger)
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
        .task { await viewModel.loadSuggestions() }
    }

    // MARK: - Sub-views

    @ViewBuilder
    private var availabilityIcon: some View {
        switch viewModel.availability {
        case .idle:
            EmptyView()
        case .checking:
            ProgressView().scaleEffect(0.85)
        case .available:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(FXTheme.Colors.accent)
        case .taken:
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(FXTheme.Colors.danger)
        }
    }

    @ViewBuilder
    private var availabilityCaption: some View {
        if let err = viewModel.formatError {
            Text(err)
                .font(.caption)
                .foregroundStyle(FXTheme.Colors.danger)
        } else {
            switch viewModel.availability {
            case .available:
                Text("Available!")
                    .font(.caption)
                    .foregroundStyle(FXTheme.Colors.accent)
            case .taken:
                Text("Username already taken.")
                    .font(.caption)
                    .foregroundStyle(FXTheme.Colors.danger)
            default:
                EmptyView()
            }
        }
    }

    private var confirmButton: some View {
        // Keep the accent background while submitting so the white spinner is
        // clearly visible — App Review reported the previous gray-on-gray state
        // looked unresponsive.
        let isActive = viewModel.canSubmit || viewModel.isSubmitting

        return Button {
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
