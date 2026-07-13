import Foundation

enum RaceFetchPolicy: Sendable {
    case ifStale
    case foreground
    case force
}

enum RaceRepositoryEvent: Equatable, Sendable {
    case joinedListFlight
    case joinedDetailFlight(String)
}

protocol RaceRepositoryProtocol: Sendable {
    func cachedList() async -> RaceListSnapshot?
    func refreshList(policy: RaceFetchPolicy) async throws -> RaceListSnapshot
    func cachedDetail(id: String) async -> RaceDetailSnapshot?
    func refreshDetail(id: String, policy: RaceFetchPolicy) async throws -> RaceDetailSnapshot
}

actor RaceRepository: RaceRepositoryProtocol {
    private let api: any APIRequesting
    private let cache: any RaceSnapshotCaching
    private let clock: any ClockProviding
    private let onEvent: (@Sendable (RaceRepositoryEvent) async -> Void)?

    private var list: RaceListSnapshot?
    private var listTask: Task<RaceListSnapshot, Error>?
    private var details: [String: RaceDetailSnapshot] = [:]
    private var detailTasks: [String: Task<RaceDetailSnapshot, Error>] = [:]

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
        if let detail = details[id] {
            return detail
        }

        do {
            let disk = try await cache.readDetail(id: id)
            if let detail = details[id] {
                return detail
            }
            if let disk {
                details[id] = disk
            }
            return disk
        } catch {
            return details[id]
        }
    }

    func refreshDetail(
        id: String,
        policy: RaceFetchPolicy
    ) async throws -> RaceDetailSnapshot {
        if let task = detailTasks[id] {
            await onEvent?(.joinedDetailFlight(id))
            return try await task.value
        }

        var cached = await cachedDetail(id: id)

        if let task = detailTasks[id] {
            await onEvent?(.joinedDetailFlight(id))
            return try await task.value
        }

        if cached != nil {
            if policy != .force, list == nil {
                _ = await cachedList()
                if let task = detailTasks[id] {
                    await onEvent?(.joinedDetailFlight(id))
                    return try await task.value
                }
                cached = details[id]
            }

            if let cached, isFresh(cached, for: policy) {
                return cached
            }
        }

        let task = Task { try await self.fetchAndPublishDetail(id: id) }
        detailTasks[id] = task
        return try await task.value
    }

    private func fetchAndPublishList() async throws -> RaceListSnapshot {
        defer { listTask = nil }

        let payload: RaceListPayload = try await api.request(.races, token: nil)
        let snapshot = RaceListSnapshot(
            schemaVersion: RaceListSnapshot.currentSchemaVersion,
            savedAt: clock.now(),
            season: payload.season,
            races: payload.races
        )

        list = snapshot
        try? await cache.writeList(snapshot)
        return snapshot
    }

    private func fetchAndPublishDetail(id: String) async throws -> RaceDetailSnapshot {
        defer { detailTasks[id] = nil }

        let payload: RaceDetailPayload = try await api.request(.raceDetail(id: id), token: nil)
        let snapshot = RaceDetailSnapshot(
            schemaVersion: RaceDetailSnapshot.currentSchemaVersion,
            savedAt: clock.now(),
            race: payload.race,
            entrants: payload.entrants,
            results: payload.results,
            qualifyingResults: payload.qualifyingResults ?? []
        )

        details[id] = snapshot
        try? await cache.writeDetail(snapshot)
        return snapshot
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
