import Foundation

@Observable
@MainActor
final class FriendsViewModel {
    // Friends list
    var friends: [UserSummary] = []
    var pendingReceived: [FriendRequest] = []
    var pendingSent: [FriendRequest] = []
    var isLoadingFriends = false

    // Search
    var searchQuery = ""
    var searchResults: [UserSummary] = []
    var isSearching = false

    // Sent request IDs (so buttons can show pending state immediately)
    var sentRequestIds: Set<String> = []

    var errorMessage: String? = nil

    private let client = APIClient()
    private var searchTask: Task<Void, Never>? = nil

    // MARK: - Load

    func loadFriends(token: String?) async {
        isLoadingFriends = true
        defer { isLoadingFriends = false }
        do {
            let response: FriendsResponse = try await client.request(.friends, token: token)
            friends = response.friends
            pendingReceived = response.pendingReceived
            pendingSent = response.pendingSent
            sentRequestIds = Set(response.pendingSent.map(\.addresseeId))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Search

    func onSearchQueryChange(token: String?) {
        searchTask?.cancel()
        guard !searchQuery.trimmingCharacters(in: .whitespaces).isEmpty else {
            searchResults = []
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000) // 300ms debounce
            guard !Task.isCancelled else { return }
            await search(token: token)
        }
    }

    private func search(token: String?) async {
        isSearching = true
        errorMessage = nil
        defer { isSearching = false }
        do {
            let results: [UserSummary] = try await client.request(
                .searchUsers(searchQuery),
                token: token
            )
            // The Task may have been cancelled between dispatch and response —
            // discard a stale result instead of overwriting fresher state.
            if Task.isCancelled { return }
            searchResults = results
        } catch {
            // URLSession surfaces cancellation as URLError(.cancelled), not
            // CancellationError; both are expected when the user keeps typing
            // and must not flash a red "Search failed" row in the UI.
            if Task.isCancelled { return }
            if error is CancellationError { return }
            if let urlError = error as? URLError, urlError.code == .cancelled { return }
            errorMessage = "Search failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Actions

    func sendFriendRequest(to userId: String, token: String?) async {
        sentRequestIds.insert(userId)
        do {
            _ = try await client.request(.sendFriendRequest(addresseeId: userId), token: token) as EmptyResponse
        } catch {
            sentRequestIds.remove(userId)
            errorMessage = error.localizedDescription
        }
    }

    func accept(_ requestId: String, token: String?) async {
        await respond(to: requestId, action: "accept", token: token)
    }

    func reject(_ requestId: String, token: String?) async {
        await respond(to: requestId, action: "reject", token: token)
    }

    private func respond(to requestId: String, action: String, token: String?) async {
        do {
            _ = try await client.request(
                .respondToFriendRequest(id: requestId, action: action),
                token: token
            ) as EmptyResponse
            await loadFriends(token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Response shapes

private struct FriendsResponse: Decodable, Sendable {
    let friends: [UserSummary]
    let pendingReceived: [FriendRequest]
    let pendingSent: [FriendRequest]
}

private struct EmptyResponse: Decodable, Sendable {}
