import SwiftUI

struct DeleteAccountConfirmView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @State private var answer = ""
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @FocusState private var fieldFocused: Bool

    private var isAnswerCorrect: Bool {
        answer.trimmingCharacters(in: .whitespaces) == "4"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()

                // Warning icon + copy
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.red)

                    Text("Permanently Delete Account")
                        .font(.title3.weight(.bold))
                        .multilineTextAlignment(.center)

                    Text("Your picks, scores, and friends list will be permanently removed. This cannot be undone.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)
                }

                Spacer()

                // Math confirmation
                VStack(alignment: .leading, spacing: 10) {
                    Text("To confirm, answer: 2 + 2")
                        .font(.subheadline.weight(.medium))

                    TextField("Your answer", text: $answer)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .focused($fieldFocused)
                }
                .padding(.horizontal, 24)

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }

                // Delete button
                Button(role: .destructive) {
                    Task { await performDeletion() }
                } label: {
                    Group {
                        if isDeleting {
                            ProgressView().tint(.white)
                        } else {
                            Text("Permanently Delete Account")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(!isAnswerCorrect || isDeleting)
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
            .navigationTitle("Delete Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .disabled(isDeleting)
                }
            }
            .onAppear { fieldFocused = true }
        }
    }

    private func performDeletion() async {
        isDeleting = true
        errorMessage = nil
        do {
            try await authManager.deleteAccount()
            // signOut() is called inside deleteAccount() — state change dismisses this sheet
            dismiss()
        } catch {
            errorMessage = "Something went wrong. Please try again."
            isDeleting = false
        }
    }
}
