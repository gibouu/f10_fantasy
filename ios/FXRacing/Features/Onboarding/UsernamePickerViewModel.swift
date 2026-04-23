import Foundation

@Observable
@MainActor
final class UsernamePickerViewModel {

    enum AvailabilityState {
        case idle, checking, available, taken
    }

    var username     = ""
    var suggestions: [String] = []
    var availability: AvailabilityState = .idle
    var isSubmitting = false
    var errorMessage: String?
    var formatError: String?

    var canSubmit: Bool {
        availability == .available
            && checkedUsername == normalizedUsername
            && !isSubmitting
    }

    let isChange: Bool
    private var debounceTask: Task<Void, Never>?
    private var checkedUsername: String?
    private let api = APIClient()

    init(isChange: Bool = false) {
        self.isChange = isChange
    }

    // MARK: - Load

    func loadSuggestions() async {
        do {
            let response: SuggestionsResponse = try await api.request(.suggestUsernames)
            suggestions = response.suggestions
        } catch {
            // Suggestions are non-critical; fail silently.
        }
    }

    // MARK: - Typing

    func onUsernameChanged(_ newValue: String) {
        debounceTask?.cancel()
        errorMessage = nil
        formatError = nil
        checkedUsername = nil

        // Trim pasted whitespace before validating or submitting.
        let value = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if value != newValue {
            username = value
        }

        guard !value.isEmpty else {
            availability = .idle
            return
        }

        // Local format validation — must pass before any API call
        if let err = localValidate(value) {
            formatError = err
            availability = .idle
            return
        }

        availability = .checking
        let candidate = value
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }

            do {
                let response: CheckResponse = try await api.request(.checkUsername(candidate))
                guard !Task.isCancelled, username == candidate else { return }
                errorMessage = nil
                checkedUsername = candidate
                availability = response.available ? .available : .taken
            } catch {
                guard !Task.isCancelled, username == candidate else { return }
                // Network/server failure — must not display as "already taken"
                availability = .idle
                errorMessage = "Couldn't verify username. Please try again."
            }
        }
    }

    // MARK: - Submit

    func submit(authManager: AuthManager) async {
        guard canSubmit else { return }
        let submittedUsername = normalizedUsername
        debounceTask?.cancel()
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            if isChange {
                try await authManager.changeUsername(submittedUsername)
            } else {
                try await authManager.setUsername(submittedUsername)
            }
        } catch {
            if case APIError.serverError(409, let message) = error {
                guard normalizedUsername == submittedUsername else { return }
                checkedUsername = submittedUsername
                availability = .taken
                errorMessage = message ?? "Username already taken."
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Private

    private var normalizedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func localValidate(_ value: String) -> String? {
        if value.count < 3 { return "Username must be at least 3 characters." }
        if value.count > 20 { return "Username must be 20 characters or fewer." }
        if value.range(of: "^[A-Za-z0-9]+$", options: .regularExpression) == nil {
            return "Only letters and numbers allowed."
        }
        return nil
    }
}

private struct CheckResponse: Decodable, Sendable {
    let available: Bool
}

private struct SuggestionsResponse: Decodable, Sendable {
    let suggestions: [String]
}
