@MainActor
protocol TokenStoring {
    func loadToken() -> String?
    func saveToken(_ token: String) throws
    func deleteToken()
}

struct KeychainTokenStore: TokenStoring {
    func loadToken() -> String? {
        KeychainService.loadToken()
    }

    func saveToken(_ token: String) throws {
        try KeychainService.saveToken(token)
    }

    func deleteToken() {
        KeychainService.deleteToken()
    }
}
