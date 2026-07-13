@testable import FXRacing

actor MemoryRaceSnapshotCache: RaceSnapshotCaching {
    enum Failure: Error {
        case requested
    }

    private struct ReadWaiter {
        let count: Int
        let continuation: CheckedContinuation<Void, Never>
    }

    var list: RaceListSnapshot?
    var details: [String: RaceDetailSnapshot]
    private(set) var listReadCount = 0
    private(set) var listWriteCount = 0
    private(set) var pruneCount = 0
    private(set) var prunedRaceIDSets: [Set<String>] = []
    private(set) var detailReadCounts: [String: Int] = [:]
    private(set) var detailWriteCounts: [String: Int] = [:]

    private var failListReads: Bool
    private var failListWrites: Bool
    private var failedDetailReads: Set<String>
    private var failedDetailWrites: Set<String>
    private var gatesListReads: Bool
    private var gatesListWrites: Bool
    private var gatedDetailReads: Set<String>
    private var listReadContinuations: [CheckedContinuation<Void, Never>] = []
    private var listWriteContinuations: [CheckedContinuation<Void, Never>] = []
    private var detailReadContinuations: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var listReadWaiters: [ReadWaiter] = []
    private var listWriteWaiters: [ReadWaiter] = []
    private var detailReadWaiters: [String: [ReadWaiter]] = [:]

    init(
        list: RaceListSnapshot? = nil,
        details: [String: RaceDetailSnapshot] = [:],
        failListReads: Bool = false,
        failListWrites: Bool = false,
        failedDetailReads: Set<String> = [],
        failedDetailWrites: Set<String> = [],
        gatesListReads: Bool = false,
        gatesListWrites: Bool = false,
        gatedDetailReads: Set<String> = []
    ) {
        self.list = list
        self.details = details
        self.failListReads = failListReads
        self.failListWrites = failListWrites
        self.failedDetailReads = failedDetailReads
        self.failedDetailWrites = failedDetailWrites
        self.gatesListReads = gatesListReads
        self.gatesListWrites = gatesListWrites
        self.gatedDetailReads = gatedDetailReads
    }

    func readList() async throws -> RaceListSnapshot? {
        listReadCount += 1
        resumeListReadWaiters()
        if gatesListReads {
            await withCheckedContinuation { continuation in
                listReadContinuations.append(continuation)
            }
        }
        if failListReads {
            throw Failure.requested
        }
        return list
    }

    func writeList(_ snapshot: RaceListSnapshot) async throws {
        listWriteCount += 1
        resumeListWriteWaiters()
        if gatesListWrites {
            await withCheckedContinuation { continuation in
                listWriteContinuations.append(continuation)
            }
        }
        if failListWrites {
            throw Failure.requested
        }
        list = snapshot
    }

    func readDetail(id: String) async throws -> RaceDetailSnapshot? {
        detailReadCounts[id, default: 0] += 1
        resumeDetailReadWaiters(id: id)
        if gatedDetailReads.contains(id) {
            await withCheckedContinuation { continuation in
                detailReadContinuations[id, default: []].append(continuation)
            }
        }
        if failedDetailReads.contains(id) {
            throw Failure.requested
        }
        return details[id]
    }

    func writeDetail(_ snapshot: RaceDetailSnapshot) async throws {
        detailWriteCounts[snapshot.race.id, default: 0] += 1
        if failedDetailWrites.contains(snapshot.race.id) {
            throw Failure.requested
        }
        details[snapshot.race.id] = snapshot
    }

    func removeDetail(id: String) async {
        details.removeValue(forKey: id)
    }

    func pruneDetails(keeping raceIDs: Set<String>) async {
        pruneCount += 1
        prunedRaceIDSets.append(raceIDs)
        details = details.filter { raceIDs.contains($0.key) }
    }

    func setList(_ snapshot: RaceListSnapshot?) {
        list = snapshot
    }

    func setDetail(_ snapshot: RaceDetailSnapshot?, id: String) {
        details[id] = snapshot
    }

    func waitForListReads(count: Int) async {
        guard listReadCount < count else { return }
        await withCheckedContinuation { continuation in
            listReadWaiters.append(ReadWaiter(count: count, continuation: continuation))
        }
    }

    func waitForListWrites(count: Int) async {
        guard listWriteCount < count else { return }
        await withCheckedContinuation { continuation in
            listWriteWaiters.append(ReadWaiter(count: count, continuation: continuation))
        }
    }

    func waitForDetailReads(id: String, count: Int) async {
        guard detailReadCounts[id, default: 0] < count else { return }
        await withCheckedContinuation { continuation in
            detailReadWaiters[id, default: []].append(
                ReadWaiter(count: count, continuation: continuation)
            )
        }
    }

    func releaseListReads() {
        gatesListReads = false
        let continuations = listReadContinuations
        listReadContinuations = []
        continuations.forEach { $0.resume() }
    }

    func releaseListWrites() {
        gatesListWrites = false
        let continuations = listWriteContinuations
        listWriteContinuations = []
        continuations.forEach { $0.resume() }
    }

    func releaseDetailReads(id: String) {
        gatedDetailReads.remove(id)
        let continuations = detailReadContinuations.removeValue(forKey: id) ?? []
        continuations.forEach { $0.resume() }
    }

    private func resumeListReadWaiters() {
        var pending: [ReadWaiter] = []
        for waiter in listReadWaiters {
            if listReadCount >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        listReadWaiters = pending
    }

    private func resumeListWriteWaiters() {
        var pending: [ReadWaiter] = []
        for waiter in listWriteWaiters {
            if listWriteCount >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        listWriteWaiters = pending
    }

    private func resumeDetailReadWaiters(id: String) {
        let count = detailReadCounts[id, default: 0]
        var pending: [ReadWaiter] = []
        for waiter in detailReadWaiters.removeValue(forKey: id) ?? [] {
            if count >= waiter.count {
                waiter.continuation.resume()
            } else {
                pending.append(waiter)
            }
        }
        if !pending.isEmpty {
            detailReadWaiters[id] = pending
        }
    }
}
