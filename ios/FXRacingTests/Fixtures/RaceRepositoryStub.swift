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
    private let refreshOutcomes: [RefreshOutcome]
    private let gatedRefreshIndices: Set<Int>
    private let gatesCachedList: Bool
    private var isCachedListReleased = false
    private var cachedListGates: [CheckedContinuation<Void, Never>] = []
    private var cachedListWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    private var releasedRefreshIndices: Set<Int> = []
    private var refreshGates: [Int: CheckedContinuation<Void, Never>] = [:]
    private var refreshWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    private var prefetchWaiters: [(Int, CheckedContinuation<Void, Never>)] = []

    private(set) var refreshPolicies: [RaceFetchPolicy] = []
    private(set) var prefetchedIDs: [[String]] = []
    private(set) var cachedListCallCount = 0

    init(
        list: RaceListSnapshot?,
        refreshOutcomes: [RefreshOutcome] = [],
        gatedRefreshIndices: Set<Int> = [],
        gatesCachedList: Bool = false
    ) {
        self.list = list
        self.refreshOutcomes = refreshOutcomes
        self.gatedRefreshIndices = gatedRefreshIndices
        self.gatesCachedList = gatesCachedList
    }

    func cachedList() async -> RaceListSnapshot? {
        cachedListCallCount += 1
        resumeCachedListWaiters()
        if gatesCachedList, !isCachedListReleased {
            await withCheckedContinuation { continuation in
                cachedListGates.append(continuation)
            }
        }
        return list
    }

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

    func cachedDetail(id: String) async -> RaceDetailSnapshot? { nil }

    func refreshDetail(
        id: String,
        policy: RaceFetchPolicy
    ) async throws -> RaceDetailSnapshot {
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

    func waitForCachedListCalls(_ count: Int) async {
        guard cachedListCallCount < count else { return }
        await withCheckedContinuation { continuation in
            cachedListWaiters.append((count, continuation))
        }
    }

    func releaseCachedList() {
        isCachedListReleased = true
        let gates = cachedListGates
        cachedListGates.removeAll()
        gates.forEach { $0.resume() }
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

    private func resumeCachedListWaiters() {
        let ready = cachedListWaiters.filter { cachedListCallCount >= $0.0 }
        cachedListWaiters.removeAll { cachedListCallCount >= $0.0 }
        ready.forEach { $0.1.resume() }
    }

    private func resumePrefetchWaiters() {
        let ready = prefetchWaiters.filter { prefetchedIDs.count >= $0.0 }
        prefetchWaiters.removeAll { prefetchedIDs.count >= $0.0 }
        ready.forEach { $0.1.resume() }
    }
}
