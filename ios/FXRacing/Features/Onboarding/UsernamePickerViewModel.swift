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

    var canSubmit: Bool { availability == .available && !isSubmitting }

    let isChange: Bool
    private var debounceTask: Task<Void, Never>?
    private let api = APIClient()

    init(isChange: Bool = false) {
        self.isChange = isChange
    }

    // MARK: - Load

    func loadSuggestions() async {
        do {
            suggestions = try await api.request(.suggestUsernames)
        } catch {
            // Suggestions are non-critical; fail silently.
        }
    }

    // MARK: - Typing

    func onUsernameChanged(_ newValue: String) {
        debounceTask?.cancel()
        errorMessage = nil
        formatError = nil

        // Trim leading/trailing whitespace per spec
        let value = newValue.trimmingCharacters(in: .whitespaces)
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
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }

            do {
                let response: CheckResponse = try await api.request(.checkUsername(value))
                availability = response.available ? .available : .taken
            } catch {
                // Network/server failure — must not display as "already taken"
                availability = .idle
                errorMessage = "Couldn't verify username. Please try again."
            }
        }
    }

    // MARK: - Submit

    func submit(authManager: AuthManager) async {
        guard canSubmit else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            if isChange {
                try await authManager.changeUsername(username)
            } else {
                try await authManager.setUsername(username)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Private

    private func localValidate(_ value: String) -> String? {
        if value.count < 3 { return "Username must be at least 3 characters." }
        if value.count > 20 { return "Username must be 20 characters or fewer." }
        let allowed = CharacterSet.alphanumerics
        if value.unicodeScalars.contains(where: { !allowed.contains($0) }) {
            return "Only letters and numbers allowed."
        }
        return nil
    }
}

private struct CheckResponse: Decodable, Sendable {
    let available: Bool
}
