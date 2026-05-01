import Foundation

@Observable
@MainActor
final class FriendProfileViewModel {
    var profile: FriendProfile? = nil
    var isLoading = true
    var errorMessage: String? = nil
    var isSendingRequest = false
    var requestSent = false

    private let client = APIClient()
    let userId: String

    init(userId: String) {
        self.userId = userId
    }

    func load(token: String?) async {
        isLoading = true
        errorMessage = nil
        fxLog(.race, "profile load userId=\(userId)")
        do {
            let loaded: FriendProfile = try await client.request(.userProfile(userId: userId), token: token)
            profile = loaded
            let scored = loaded.picks.filter { $0.scoreBreakdown != nil }.count
            fxLog(.race, "profile loaded userId=\(userId) picks=\(loaded.picks.count) scored=\(scored)")
        } catch {
            errorMessage = error.localizedDescription
            fxError(.race, "profile load failed userId=\(userId): \(error.localizedDescription)")
        }
        isLoading = false
    }

    func sendFriendRequest(token: String?) async {
        isSendingRequest = true
        do {
            _ = try await client.request(
                .sendFriendRequest(addresseeId: userId),
                token: token
            ) as EmptyResponse
            requestSent = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isSendingRequest = false
    }

    var totalScore: Int {
        profile?.picks.compactMap { $0.scoreBreakdown?.totalScore }.reduce(0, +) ?? 0
    }
}

private struct EmptyResponse: Decodable, Sendable {}
