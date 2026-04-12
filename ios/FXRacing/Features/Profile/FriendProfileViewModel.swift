import Foundation

@Observable
@MainActor
final class FriendProfileViewModel {
    var profile: FriendProfile? = nil
    var isLoading = false
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
        do {
            profile = try await client.request(.userProfile(userId: userId), token: token)
        } catch {
            errorMessage = error.localizedDescription
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
