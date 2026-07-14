import Foundation
@testable import FXRacing

enum RaceRepositoryStubError: LocalizedError, Sendable {
    case unavailable

    var errorDescription: String? { "The race calendar is unavailable." }
}

actor RaceRepositoryStub: RaceRepositoryProtocol {
    enum RefreshOutcome: Sendable {
        case snapshot(RaceListSnapshot)
        case failure(RaceRepositoryStubError)
    }

    private var list: RaceListSnapshot?
    private let details: [String: RaceDetailSnapshot]
    private let refreshOutcomes: [RefreshOutcome]
    private let gatedRefreshIndices: Set<Int>
    private var releasedRefreshIndices: Set<Int> = []
    private var refreshGates: [Int: CheckedContinuation<Void, Never>] = [:]
    private var refreshWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    private var prefetchWaiters: [(Int, CheckedContinuation<Void, Never>)] = []

    private(set) var refreshPolicies: [RaceFetchPolicy] = []
    private(set) var prefetchedIDs: [[String]] = []

    init(
        list: RaceListSnapshot?,
        details: [String: RaceDetailSnapshot] = [:],
        refreshOutcomes: [RefreshOutcome] = [],
        gatedRefreshIndices: Set<Int> = []
    ) {
        self.list = list
        self.details = details
        self.refreshOutcomes = refreshOutcomes
        self.gatedRefreshIndices = gatedRefreshIndices
    }

    func cachedList() async -> RaceListSnapshot? { list }

    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot {
        let index = refreshPolicies.count
        refreshPolicies.append(policy)
        resumeRefreshWaiters()

        if gatedRefreshIndices.contains(index),
           !releasedRefreshIndices.contains(index) {
            await withCheckedContinuation { continuation in
                refreshGates[index] = continuation
            }
        }

        let outcome: RefreshOutcome
        if refreshOutcomes.indices.contains(index) {
            outcome = refreshOutcomes[index]
        } else if let list {
            outcome = .snapshot(list)
        } else {
            outcome = .failure(.unavailable)
        }

        switch outcome {
        case .snapshot(let snapshot):
            list = snapshot
            return snapshot
        case .failure(let error):
            throw error
        }
    }

    func cachedDetail(id: String) async -> RaceDetailSnapshot? { details[id] }

    func refreshDetail(
        id: String,
        policy: RaceFetchPolicy
    ) async throws -> RaceDetailSnapshot {
        if let detail = details[id] { return detail }
        throw APIError.notFound
    }

    func prefetchDetail(ids: [String]) async {
        prefetchedIDs.append(ids)
        resumePrefetchWaiters()
    }

    func waitForRefreshCalls(_ count: Int) async {
        guard refreshPolicies.count < count else { return }
        await withCheckedContinuation { continuation in
            refreshWaiters.append((count, continuation))
        }
    }

    func releaseRefresh(at index: Int) {
        releasedRefreshIndices.insert(index)
        refreshGates.removeValue(forKey: index)?.resume()
    }

    func waitForPrefetchCalls(_ count: Int) async {
        guard prefetchedIDs.count < count else { return }
        await withCheckedContinuation { continuation in
            prefetchWaiters.append((count, continuation))
        }
    }

    private func resumeRefreshWaiters() {
        let ready = refreshWaiters.filter { refreshPolicies.count >= $0.0 }
        refreshWaiters.removeAll { refreshPolicies.count >= $0.0 }
        ready.forEach { $0.1.resume() }
    }

    private func resumePrefetchWaiters() {
        let ready = prefetchWaiters.filter { prefetchedIDs.count >= $0.0 }
        prefetchWaiters.removeAll { prefetchedIDs.count >= $0.0 }
        ready.forEach { $0.1.resume() }
    }
}
