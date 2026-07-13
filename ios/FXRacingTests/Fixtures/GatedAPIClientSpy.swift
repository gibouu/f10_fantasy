import Foundation
@testable import FXRacing

actor GatedAPIClientSpy: APIRequesting {
    enum Stub: @unchecked Sendable {
        case data(Data)
        case failure(APIError)

        static func json<T: Encodable & Sendable>(_ value: T) -> Stub {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            return .data(try! encoder.encode(value))
        }
    }

    struct Request: Sendable {
        let method: String
        let path: String
        let token: String?
    }

    private struct CallWaiter {
        let count: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    private var responses: [String: [Stub]]
    private var gatedKeys: Set<String>
    private var requestWaiters: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var callWaiters: [String: [CallWaiter]] = [:]
    private var requests: [Request] = []

    init(
        responses: [String: [Stub]],
        gatedKeys: Set<String> = []
    ) {
        self.responses = responses
        self.gatedKeys = gatedKeys
    }

    func request<T: Decodable & Sendable>(
        _ endpoint: APIEndpoint,
        token: String?
    ) async throws -> T {
        let key = "\(endpoint.method) \(endpoint.path)"
        requests.append(Request(method: endpoint.method, path: endpoint.path, token: token))

        guard var stubs = responses[key], !stubs.isEmpty else {
            resumeSatisfiedCallWaiters(for: key)
            throw APIError.notFound
        }
        let stub = stubs.removeFirst()
        responses[key] = stubs
        resumeSatisfiedCallWaiters(for: key)

        if gatedKeys.contains(key) {
            await withCheckedContinuation { continuation in
                requestWaiters[key, default: []].append(continuation)
            }
        }

        switch stub {
        case .data(let data):
            return try JSONDecoder.api().decode(T.self, from: data)
        case .failure(let error):
            throw error
        }
    }

    func waitForCalls(to path: String, count: Int) async {
        let key = "GET \(path)"
        guard calls(for: key) < count else { return }
        await withCheckedContinuation { continuation in
            callWaiters[key, default: []].append(
                CallWaiter(count: count, continuation: continuation)
            )
        }
    }

    func releaseRequests(to path: String) {
        let key = "GET \(path)"
        gatedKeys.remove(key)
        let waiters = requestWaiters.removeValue(forKey: key) ?? []
        waiters.forEach { $0.resume() }
    }

    func calls(to path: String) -> Int {
        requests.filter { $0.method == "GET" && $0.path == path }.count
    }

    func recordedRequests() -> [Request] {
        requests
    }

    private func calls(for key: String) -> Int {
        requests.filter { "\($0.method) \($0.path)" == key }.count
    }

    private func resumeSatisfiedCallWaiters(for key: String) {
        let currentCount = calls(for: key)
        var pending: [CallWaiter] = []
        for waiter in callWaiters.removeValue(forKey: key) ?? [] {
            if currentCount >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        if !pending.isEmpty {
            callWaiters[key] = pending
        }
    }
}
