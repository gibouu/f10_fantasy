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

        guard newValue.count >= 3 else {
            availability = .idle
            return
        }

        availability = .checking
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }

            do {
                let response: CheckResponse = try await api.request(.checkUsername(newValue))
                availability = response.available ? .available : .taken
            } catch {
                availability = .idle
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
}

private struct CheckResponse: Decodable, Sendable {
    let available: Bool
}
