protocol APIRequesting: Sendable {
    func request<T: Decodable & Sendable>(
        _ endpoint: APIEndpoint,
        token: String?
    ) async throws -> T
}

extension APIClient: APIRequesting {}
