import Foundation
@testable import FXRacing

actor GatedAPIClientSpy: APIRequesting {
    enum Event: Equatable, Sendable {
        case started(Int)
        case released(Int)
        case completed(Int)
    }

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
        let id: Int
        let method: String
        let path: String
        let token: String?
        let query: [String: String]
        let bodyData: Data?
    }

    private struct CallWaiter {
        let count: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    private var responses: [String: [Stub]]
    private var gatedKeys: Set<String>
    private var nextRequestID = 0
    private var requestWaiters: [Int: CheckedContinuation<Void, Never>] = [:]
    private var requestKeys: [Int: String] = [:]
    private var gatedRequestIDs: [String: Set<Int>] = [:]
    private var callWaiters: [String: [CallWaiter]] = [:]
    private var requests: [Request] = []
    private var events: [Event] = []

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
        nextRequestID += 1
        let requestID = nextRequestID
        let query = endpoint.queryItems.reduce(into: [String: String]()) { values, item in
            guard let value = item.value else { return }
            values[item.name] = value
        }
        requests.append(
            Request(
                id: requestID,
                method: endpoint.method,
                path: endpoint.path,
                token: token,
                query: query,
                bodyData: endpoint.bodyData
            )
        )
        events.append(.started(requestID))
        requestKeys[requestID] = key

        guard var stubs = responses[key], !stubs.isEmpty else {
            resumeSatisfiedCallWaiters(for: key)
            throw APIError.notFound
        }
        let stub = stubs.removeFirst()
        responses[key] = stubs
        resumeSatisfiedCallWaiters(for: key)

        if gatedKeys.contains(key) {
            await withCheckedContinuation { continuation in
                requestWaiters[requestID] = continuation
                gatedRequestIDs[key, default: []].insert(requestID)
            }
        }
        events.append(.completed(requestID))

        switch stub {
        case .data(let data):
            return try JSONDecoder.api().decode(T.self, from: data)
        case .failure(let error):
            throw error
        }
    }

    func waitForCalls(
        method: String = "GET",
        to path: String,
        count: Int
    ) async {
        let key = "\(method) \(path)"
        guard calls(for: key) < count else { return }
        await withCheckedContinuation { continuation in
            callWaiters[key, default: []].append(
                CallWaiter(count: count, continuation: continuation)
            )
        }
    }

    func waitForRequest(
        method: String = "GET",
        to path: String,
        ordinal: Int
    ) async -> Int {
        await waitForCalls(method: method, to: path, count: ordinal)
        return requests.filter { $0.method == method && $0.path == path }[ordinal - 1].id
    }

    func releaseRequest(id: Int) {
        guard let continuation = requestWaiters.removeValue(forKey: id) else { return }
        if let key = requestKeys[id] {
            gatedRequestIDs[key]?.remove(id)
        }
        events.append(.released(id))
        continuation.resume()
    }

    func releaseRequests(method: String = "GET", to path: String) {
        let key = "\(method) \(path)"
        gatedKeys.remove(key)
        let ids = gatedRequestIDs.removeValue(forKey: key) ?? []
        for id in ids {
            guard let continuation = requestWaiters.removeValue(forKey: id) else {
                continue
            }
            events.append(.released(id))
            continuation.resume()
        }
    }

    func calls(method: String = "GET", to path: String) -> Int {
        requests.filter { $0.method == method && $0.path == path }.count
    }

    func recordedRequests() -> [Request] {
        requests
    }

    func recordedEvents(requestIDs: Set<Int>) -> [Event] {
        events.filter { event in
            switch event {
            case .started(let id), .released(let id), .completed(let id):
                return requestIDs.contains(id)
            }
        }
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
