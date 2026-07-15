import Foundation
@testable import FXRacing

actor APIClientSpy: APIRequesting {
    enum Stub: @unchecked Sendable {
        case data(Data)
        case failure(APIError)

        static func json<T: Encodable & Sendable>(_ value: T) -> Stub {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            return .data(try! encoder.encode(value))
        }
    }

    private let responses: [String: Stub]
    private(set) var requests: [String] = []

    init(responses: [String: Stub]) {
        self.responses = responses
    }

    var methods: [String] {
        requests.map { String($0.split(separator: " ", maxSplits: 1)[0]) }
    }

    var totalCallCount: Int { requests.count }

    func calls(to path: String) -> Int {
        requests.filter { $0.hasSuffix(" \(path)") }.count
    }

    func request<T: Decodable & Sendable>(
        _ endpoint: APIEndpoint,
        token: String?
    ) async throws -> T {
        let key = "\(endpoint.method) \(endpoint.path)"
        requests.append(key)
        guard let stub = responses[key] else { throw APIError.notFound }

        switch stub {
        case .data(let data):
            return try JSONDecoder.api().decode(T.self, from: data)
        case .failure(let error):
            throw error
        }
    }
}
