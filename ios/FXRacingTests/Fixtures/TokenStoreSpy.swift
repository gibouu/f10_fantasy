import Foundation
@testable import FXRacing

@MainActor
final class TokenStoreSpy: TokenStoring {
    enum Operation: Equatable {
        case load
        case save(String)
        case delete
    }

    var token: String?
    var saveError: Error?
    private(set) var operations: [Operation] = []

    init(token: String? = nil) {
        self.token = token
    }

    func loadToken() -> String? {
        operations.append(.load)
        return token
    }

    func saveToken(_ token: String) throws {
        operations.append(.save(token))
        if let saveError {
            throw saveError
        }
        self.token = token
    }

    func deleteToken() {
        operations.append(.delete)
        token = nil
    }
}
