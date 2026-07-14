import Foundation

enum RaceFetchPolicy: Sendable {
    case ifStale
    case foreground
    case force
}

enum RaceRepositoryEvent: Equatable, Sendable {
    case joinedListFlight
    case startedDetailFlight(String)
    case joinedDetailFlight(String)
}

protocol RaceRepositoryProtocol: Sendable {
    func cachedList() async -> RaceListSnapshot?
    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot
    func cachedDetail(id: String) async -> RaceDetailSnapshot?
    func refreshDetail(id: String, policy: RaceFetchPolicy) async throws -> RaceDetailSnapshot
    func prefetchDetail(ids: [String]) async
    func replaceDetailPrefetch(ids: [String]) async
}

extension RaceRepositoryProtocol {
    func replaceDetailPrefetch(ids: [String]) async {
        await prefetchDetail(ids: ids)
    }
}

actor RaceRepository: RaceRepositoryProtocol {
    private enum DetailDemand: Sendable {
        case visible
        case prefetch(generation: UInt64)

        var isPrefetch: Bool {
            if case .prefetch = self { return true }
            return false
        }
    }

    private struct DetailFlight: Sendable {
        let token: UInt64
        let epoch: UInt64
        let task: Task<RaceDetailSnapshot, Error>
        var isPrefetchOnly: Bool
    }

    private struct DetailEpochBarrier: Sendable {
        let epoch: UInt64
        let task: Task<Void, Never>
    }

    private struct DetailIdentityError: LocalizedError {
        let expectedID: String
        let actualID: String

        var errorDescription: String? {
            "Race detail identity mismatch (expected \(expectedID), received \(actualID))."
        }
    }

    private let api: any APIRequesting
    private let cache: any RaceSnapshotCaching
    private let clock: any ClockProviding
    private let onEvent: (@Sendable (RaceRepositoryEvent) async -> Void)?

    private var list: RaceListSnapshot?
    private var listTask: Task<RaceListSnapshot, Error>?
    private var details: [String: RaceDetailSnapshot] = [:]
    private var detailTasks: [String: DetailFlight] = [:]
    private var detailEpoch: UInt64 = 0
    private var nextDetailToken: UInt64 = 0
    private var detailEpochBarrier: DetailEpochBarrier?
    private var allowedDetailIDsAfterRollover: Set<String>?
    private var prefetchGeneration: UInt64 = 0
    private var prefetchScopeIDs: Set<String> = []

    init(
        api: any APIRequesting,
        cache: any RaceSnapshotCaching,
        clock: any ClockProviding,
        onEvent: (@Sendable (RaceRepositoryEvent) async -> Void)? = nil
    ) {
        self.api = api
        self.cache = cache
        self.clock = clock
        self.onEvent = onEvent
    }

    func cachedList() async -> RaceListSnapshot? {
        if let list {
            return list
        }

        do {
            let disk = try await cache.readList()
            if let list {
                return list
            }
            if let disk {
                list = disk
            }
            return disk
        } catch {
            return list
        }
    }

    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot {
        if let listTask {
            await onEvent?(.joinedListFlight)
            return try await listTask.value
        }

        let cached = await cachedList()

        if let listTask {
            await onEvent?(.joinedListFlight)
            return try await listTask.value
        }

        if let cached, isFresh(cached, for: policy) {
            return cached
        }

        let task = Task { try await self.fetchAndPublishList() }
        listTask = task
        return try await task.value
    }

    func cachedDetail(id: String) async -> RaceDetailSnapshot? {
        guard isDetailAllowed(id) else {
            return nil
        }

        if list == nil {
            _ = await cachedList()
            guard isDetailAllowed(id) else {
                return nil
            }
        }

        if let detail = details[id] {
            guard isCompatible(detail.race, requestedID: id) else {
                details[id] = nil
                return nil
            }
            return detail
        }

        do {
            let disk = try await cache.readDetail(id: id)
            guard isDetailAllowed(id) else {
                return nil
            }
            if let detail = details[id] {
                guard isCompatible(detail.race, requestedID: id) else {
                    details[id] = nil
                    return nil
                }
                return detail
            }
            if let disk, isCompatible(disk.race, requestedID: id) {
                details[id] = disk
                return disk
            }
            return nil
        } catch {
            guard let detail = details[id], isCompatible(detail.race, requestedID: id) else {
                details[id] = nil
                return nil
            }
            return detail
        }
    }

    func refreshDetail(
        id: String,
        policy: RaceFetchPolicy
    ) async throws -> RaceDetailSnapshot {
        try await refreshDetail(id: id, policy: policy, demand: .visible)
    }

    private func refreshDetail(
        id: String,
        policy: RaceFetchPolicy,
        demand: DetailDemand
    ) async throws -> RaceDetailSnapshot {
        guard isDetailAllowed(id) else {
            throw APIError.notFound
        }
        try ensureCurrent(demand: demand, id: id)

        if let task = currentDetailFlight(id: id, demand: demand) {
            await onEvent?(.joinedDetailFlight(id))
            return try await task.task.value
        }

        var cached: RaceDetailSnapshot?
        if policy == .force {
            cached = nil
        } else {
            cached = await cachedDetail(id: id)
        }

        guard isDetailAllowed(id) else {
            throw APIError.notFound
        }
        try ensureCurrent(demand: demand, id: id)

        if let task = currentDetailFlight(id: id, demand: demand) {
            await onEvent?(.joinedDetailFlight(id))
            return try await task.task.value
        }

        if cached != nil {
            if policy != .force, list == nil {
                _ = await cachedList()
                guard isDetailAllowed(id) else {
                    throw APIError.notFound
                }
                try ensureCurrent(demand: demand, id: id)
                if let task = currentDetailFlight(id: id, demand: demand) {
                    await onEvent?(.joinedDetailFlight(id))
                    return try await task.task.value
                }
                cached = details[id]
            }

            if let cached, isFresh(cached, for: policy) {
                return cached
            }
        }

        try ensureCurrent(demand: demand, id: id)

        nextDetailToken &+= 1
        let token = nextDetailToken
        let epoch = detailEpoch
        let task = Task {
            try await self.fetchAndPublishDetail(id: id, token: token, epoch: epoch)
        }
        detailTasks[id] = DetailFlight(
            token: token,
            epoch: epoch,
            task: task,
            isPrefetchOnly: demand.isPrefetch
        )
        await onEvent?(.startedDetailFlight(id))
        return try await task.value
    }

    func prefetchDetail(ids: [String]) async {
        await replaceDetailPrefetch(ids: ids)
    }

    func replaceDetailPrefetch(ids: [String]) async {
        guard !Task.isCancelled else { return }

        var seen: Set<String> = []
        var selected: [String] = []
        for id in ids {
            guard seen.insert(id).inserted else { continue }
            selected.append(id)
            if selected.count == 2 { break }
        }

        prefetchGeneration &+= 1
        let generation = prefetchGeneration
        let nextScope = Set(selected)
        let removedIDs = prefetchScopeIDs.subtracting(nextScope)
        prefetchScopeIDs = nextScope

        for id in removedIDs {
            guard let flight = detailTasks[id], flight.isPrefetchOnly else { continue }
            flight.task.cancel()
            detailTasks[id] = nil
        }

        await withTaskGroup(of: Void.self) { group in
            for id in selected {
                group.addTask {
                    _ = try? await self.refreshDetail(
                        id: id,
                        policy: .ifStale,
                        demand: .prefetch(generation: generation)
                    )
                }
            }
        }
    }

    private func fetchAndPublishList() async throws -> RaceListSnapshot {
        defer { listTask = nil }

        let payload: RaceListPayload = try await api.request(.races, token: nil)
        let previousList = list
        let previousSeasonID = previousList?.season?.id
        let nextSeasonID = payload.season?.id
        let isSeasonRollover = previousSeasonID != nil
            && nextSeasonID != nil
            && previousSeasonID != nextSeasonID
        let validatedDetailSeasonID: String?
        if isSeasonRollover {
            validatedDetailSeasonID = nextSeasonID
        } else if previousSeasonID != nil, previousSeasonID == nextSeasonID {
            validatedDetailSeasonID = previousList?.validatedDetailSeasonID
        } else {
            validatedDetailSeasonID = nil
        }
        let snapshot = RaceListSnapshot(
            schemaVersion: RaceListSnapshot.currentSchemaVersion,
            savedAt: clock.now(),
            season: payload.season,
            races: payload.races,
            validatedDetailSeasonID: validatedDetailSeasonID
        )

        list = snapshot
        let newRaceIDs = Set(snapshot.races.map(\.id))

        if isSeasonRollover {
            detailEpoch &+= 1
            prefetchGeneration &+= 1
            prefetchScopeIDs.removeAll()
            let newEpoch = detailEpoch
            let epochTask = Task { await self.cache.advanceDetailEpoch(to: newEpoch) }
            detailEpochBarrier = DetailEpochBarrier(epoch: newEpoch, task: epochTask)
            allowedDetailIDsAfterRollover = newRaceIDs

            var racesByID: [String: Race] = [:]
            for race in snapshot.races {
                racesByID[race.id] = race
            }
            details = details.filter { id, detail in
                guard let currentRace = racesByID[id] else { return false }
                return currentRace.seasonId == detail.race.seasonId
            }

            let oldFlights = detailTasks.values.map(\.task)
            detailTasks.removeAll()
            oldFlights.forEach { $0.cancel() }

            await epochTask.value
            if detailEpochBarrier?.epoch == newEpoch {
                detailEpochBarrier = nil
            }
        } else if allowedDetailIDsAfterRollover != nil {
            allowedDetailIDsAfterRollover?.formUnion(newRaceIDs)
        }

        do {
            try await cache.writeList(snapshot)
            if isSeasonRollover {
                await cache.pruneDetails(keeping: newRaceIDs)
            }
        } catch {
            // Public network data is still usable when persistence fails.
        }
        return snapshot
    }

    private func fetchAndPublishDetail(
        id: String,
        token: UInt64,
        epoch: UInt64
    ) async throws -> RaceDetailSnapshot {
        defer {
            if detailTasks[id]?.token == token {
                detailTasks[id] = nil
            }
        }

        let payload: RaceDetailPayload = try await api.request(.raceDetail(id: id), token: nil)
        try ensureCurrentDetailFlight(id: id, token: token, epoch: epoch)
        guard isCompatible(payload.race, requestedID: id) else {
            throw APIError.decodingFailed(
                DetailIdentityError(expectedID: id, actualID: payload.race.id)
            )
        }
        let snapshot = RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: clock.now(),
            race: payload.race,
            entrants: payload.entrants,
            results: payload.results,
            qualifyingResults: payload.qualifyingResults ?? []
        )

        try ensureCurrentDetailFlight(id: id, token: token, epoch: epoch)
        details[id] = snapshot
        if let barrier = detailEpochBarrier, barrier.epoch == epoch {
            try ensureCurrentDetailFlight(id: id, token: token, epoch: epoch)
            await barrier.task.value
        }
        try ensureCurrentDetailFlight(id: id, token: token, epoch: epoch)
        _ = try? await cache.writeDetail(snapshot, epoch: epoch)
        try ensureCurrentDetailFlight(id: id, token: token, epoch: epoch)
        return snapshot
    }

    private func currentDetailFlight(
        id: String,
        demand: DetailDemand
    ) -> DetailFlight? {
        guard var flight = detailTasks[id] else {
            return nil
        }
        guard flight.epoch == detailEpoch else {
            flight.task.cancel()
            detailTasks[id] = nil
            return nil
        }

        if case .visible = demand, flight.isPrefetchOnly {
            flight.isPrefetchOnly = false
            detailTasks[id] = flight
        }
        return flight
    }

    private func ensureCurrent(demand: DetailDemand, id: String) throws {
        guard case .prefetch(let generation) = demand else { return }
        guard !Task.isCancelled,
              generation == prefetchGeneration,
              prefetchScopeIDs.contains(id)
        else {
            throw CancellationError()
        }
    }

    private func ensureCurrentDetailFlight(
        id: String,
        token: UInt64,
        epoch: UInt64
    ) throws {
        guard !Task.isCancelled,
              epoch == detailEpoch,
              isDetailAllowed(id),
              detailTasks[id]?.token == token
        else {
            throw CancellationError()
        }
    }

    private func isDetailAllowed(_ id: String) -> Bool {
        allowedDetailIDsAfterRollover?.contains(id) ?? true
    }

    private func isCompatible(_ race: Race, requestedID: String) -> Bool {
        guard race.id == requestedID else {
            return false
        }
        guard let currentList = list else {
            return true
        }
        if let currentRace = currentList.races.first(where: { $0.id == requestedID }) {
            return currentRace.seasonId == race.seasonId
        }
        guard let validatedSeasonID = currentList.validatedDetailSeasonID else {
            return true
        }
        return validatedSeasonID == race.seasonId
    }

    private func isFresh(_ snapshot: RaceListSnapshot, for policy: RaceFetchPolicy) -> Bool {
        let age = clock.now().timeIntervalSince(snapshot.savedAt)
        switch policy {
        case .ifStale:
            return age < 60
        case .foreground:
            return age < 30
        case .force:
            return false
        }
    }

    private func isFresh(_ snapshot: RaceDetailSnapshot, for policy: RaceFetchPolicy) -> Bool {
        guard policy != .force else {
            return false
        }

        let status = list?.races.first { $0.id == snapshot.race.id }?.status
            ?? snapshot.race.status
        let lifetime: TimeInterval = switch status {
        case .upcoming:
            300
        case .live:
            60
        case .completed, .cancelled:
            21_600
        }
        return clock.now().timeIntervalSince(snapshot.savedAt) < lifetime
    }
}
