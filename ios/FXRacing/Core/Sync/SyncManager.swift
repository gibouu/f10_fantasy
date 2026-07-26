import Foundation

enum PickSyncResult: Sendable {
    case saved(Pick)
    case queued
    case conflict(Pick?)
    case expired(Pick?)
    case unauthorized
}

/// Serializes each owner/race outbox record through one revision-checked worker.
@MainActor
final class SyncManager {
    struct SessionLease: Equatable, Sendable {
        fileprivate let id: UUID
        let userID: String
        fileprivate let token: String
    }

    private struct Worker {
        let token: UUID
        let sessionID: UUID?
        let task: Task<PickSyncResult, Never>
    }

    private struct RaceLane {
        let token: UUID
        let sessionID: UUID?
        let task: Task<Void, Never>
    }

    private enum AuthoritativePickResult {
        case resolved(Pick?)
        case unauthorized
    }

    private let api: any APIRequesting
    private let clock: any ClockProviding
    private var workers: [LocalPickRecordID: Worker] = [:]
    private var raceLanes: [String: RaceLane] = [:]
    private var latestExplicitRevision: [LocalPickRecordID: UInt64] = [:]
    private var activeSession: SessionLease?
    private var unauthorizedHandler: ((String) -> Void)?
    private var requiresActiveSession = false

    init(
        api: any APIRequesting = APIClient(),
        clock: any ClockProviding = SystemClock()
    ) {
        self.api = api
        self.clock = clock
    }

    func setUnauthorizedHandler(_ handler: @escaping (String) -> Void) {
        unauthorizedHandler = handler
        requiresActiveSession = true
    }

    /// Central entry point for private requests that receive a 401. The auth
    /// owner validates the rejected token before changing the active session.
    func reportUnauthorized(rejectedToken: String) {
        unauthorizedHandler?(rejectedToken)
    }

    func beginSession(
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore
    ) -> SessionLease {
        invalidateSession(localPickStore: localPickStore)
        let lease = SessionLease(
            id: UUID(),
            userID: currentUserID,
            token: token
        )
        activeSession = lease
        return lease
    }

    func currentSessionLease(
        currentUserID: String,
        token: String
    ) -> SessionLease? {
        activeLease(currentUserID: currentUserID, token: token)
    }

    func invalidateSession(localPickStore: LocalPickStore?) {
        guard let sessionID = activeSession?.id else { return }

        let staleWorkers = workers.filter {
            $0.value.sessionID == sessionID
        }
        for (id, worker) in staleWorkers {
            worker.task.cancel()
            if let record = localPickStore?.record(id: id),
               case .syncing(let revision, _) = record.syncState {
                _ = localPickStore?.transition(
                    id: id,
                    revision: revision,
                    to: .queued
                )
            }
            workers[id] = nil
            latestExplicitRevision[id] = nil
        }

        let staleLanes = raceLanes.filter {
            $0.value.sessionID == sessionID
        }
        for (raceID, lane) in staleLanes {
            lane.task.cancel()
            raceLanes[raceID] = nil
        }
        activeSession = nil
    }

    func submitExplicit(
        id: LocalPickRecordID,
        revision: UInt64,
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore
    ) async -> PickSyncResult {
        let sessionLease = currentSessionLease(
            currentUserID: currentUserID,
            token: token
        )
        guard !requiresActiveSession || sessionLease != nil else {
            return .queued
        }
        guard case .user(let ownerID) = id.owner,
              ownerID == currentUserID,
              let record = localPickStore.record(id: id),
              record.revision == revision,
              isProcessable(record.syncState, revision: revision)
        else { return .queued }

        latestExplicitRevision[id] = max(
            latestExplicitRevision[id] ?? 0,
            revision
        )
        return await runOrJoin(
            id: id,
            currentUserID: currentUserID,
            token: token,
            localPickStore: localPickStore,
            races: [],
            sessionLease: sessionLease
        )
    }

    func resumeEligiblePicks(
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore,
        races: [Race] = [],
        sessionLease: SessionLease? = nil
    ) async {
        guard isCurrent(sessionLease) else { return }
        let records = localPickStore.retryableRecords(
            currentUserID: currentUserID
        ).filter { record in
            guard case .syncing = record.syncState else { return true }
            return workers[record.id] == nil
        }
        for record in records {
            guard isCurrent(sessionLease) else { return }
            let result = await runOrJoin(
                id: record.id,
                currentUserID: currentUserID,
                token: token,
                localPickStore: localPickStore,
                races: races,
                sessionLease: sessionLease
            )
            if case .unauthorized = result {
                return
            }
        }
    }

    private func runOrJoin(
        id: LocalPickRecordID,
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore,
        races: [Race],
        sessionLease: SessionLease? = nil
    ) async -> PickSyncResult {
        guard isCurrent(sessionLease) else { return .queued }
        if let worker = workers[id] {
            return await worker.task.value
        }

        let previousLane = raceLanes[id.raceID]?.task
        let laneToken = UUID()
        let workerToken = UUID()
        let task = Task { @MainActor [weak self] in
            await previousLane?.value
            guard let self, self.isCurrent(sessionLease) else {
                return PickSyncResult.queued
            }
            let result = await self.runWorker(
                id: id,
                currentUserID: currentUserID,
                token: token,
                localPickStore: localPickStore,
                races: races,
                sessionLease: sessionLease
            )
            self.finishWorker(id: id, token: workerToken)
            return result
        }
        workers[id] = Worker(
            token: workerToken,
            sessionID: sessionLease?.id,
            task: task
        )
        let laneTask = Task { @MainActor [weak self] in
            _ = await task.value
            self?.finishRaceLane(raceID: id.raceID, token: laneToken)
        }
        raceLanes[id.raceID] = RaceLane(
            token: laneToken,
            sessionID: sessionLease?.id,
            task: laneTask
        )
        return await task.value
    }

    private func finishRaceLane(raceID: String, token: UUID) {
        guard raceLanes[raceID]?.token == token else { return }
        raceLanes[raceID] = nil
    }

    private func finishWorker(id: LocalPickRecordID, token: UUID) {
        guard workers[id]?.token == token else { return }
        workers[id] = nil
        latestExplicitRevision[id] = nil
    }

    private func runWorker(
        id: LocalPickRecordID,
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore,
        races: [Race],
        sessionLease: SessionLease?
    ) async -> PickSyncResult {
        while true {
            guard isCurrent(sessionLease) else { return .queued }
            guard let record = localPickStore.record(id: id),
                  isEligible(record.id.owner, currentUserID: currentUserID),
                  isProcessable(record.syncState, revision: record.revision)
            else { return .queued }

            if discardSupersededGuest(
                record,
                currentUserID: currentUserID,
                localPickStore: localPickStore,
                sessionLease: sessionLease
            ) {
                return .queued
            }

            let revision = record.revision
            let isExplicit = latestExplicitRevision[id] == revision
            let mode: PickSyncMode = isExplicit
                ? .direct
                : record.id.owner == .guest
                    ? .guestMigration
                    : .authenticatedRetry

            if record.syncState == .queued {
                guard isCurrent(sessionLease) else { return .queued }
                guard localPickStore.transition(
                    id: id,
                    revision: revision,
                    to: .syncing(revision: revision, mode: mode)
                ) else { return .queued }
            }

            if !isExplicit {
                if let race = races.first(where: { $0.id == id.raceID }),
                   clock.now() >= race.lockCutoffUtc {
                    return terminalResult(
                        .expired,
                        id: id,
                        revision: revision,
                        localPickStore: localPickStore,
                        success: .expired(nil),
                        sessionLease: sessionLease
                    )
                }

                do {
                    guard isCurrent(sessionLease) else { return .queued }
                    let response: PickResponse = try await api.request(
                        .pickForRace(raceId: id.raceID),
                        token: token
                    )
                    guard isCurrent(sessionLease) else { return .queued }
                    if shouldFollowNewerExplicitRevision(
                        id: id,
                        capturedRevision: revision,
                        localPickStore: localPickStore
                    ) {
                        continue
                    }
                    guard currentRevision(
                        id: id,
                        equals: revision,
                        localPickStore: localPickStore
                    ) else { return .queued }

                    if discardSupersededGuest(
                        record,
                        currentUserID: currentUserID,
                        localPickStore: localPickStore,
                        sessionLease: sessionLease
                    ) {
                        return .queued
                    }

                    guard localPickStore.preserveAuthoritative(
                        response.pick,
                        for: .user(currentUserID)
                    ) else {
                        queueCapturedRevision(
                            id: id,
                            revision: revision,
                            localPickStore: localPickStore,
                            sessionLease: sessionLease
                        )
                        return .queued
                    }

                    if matches(response.pick, record: record) {
                        return terminalResult(
                            .confirmed,
                            id: id,
                            revision: revision,
                            localPickStore: localPickStore,
                            success: .saved(response.pick),
                            confirmedUserID: currentUserID,
                            sessionLease: sessionLease
                        )
                    }

                    if latestExplicitRevision[id] != revision {
                        let reason: PickConflictReason = record.id.owner == .guest
                            ? .serverWins
                            : .accountPickFound
                        return terminalResult(
                            .conflict(reason),
                            id: id,
                            revision: revision,
                            localPickStore: localPickStore,
                            success: .conflict(response.pick),
                            sessionLease: sessionLease
                        )
                    }
                } catch APIError.notFound {
                    guard isCurrent(sessionLease) else { return .queued }
                    // A missing server pick is the only automatic path to POST.
                } catch APIError.unauthorized {
                    guard isCurrent(sessionLease) else { return .queued }
                    queueCapturedRevision(
                        id: id,
                        revision: revision,
                        localPickStore: localPickStore,
                        sessionLease: sessionLease
                    )
                    reportUnauthorized(rejectedToken: token)
                    return .unauthorized
                } catch APIError.serverError(let code, _) where code == 423 {
                    guard isCurrent(sessionLease) else { return .queued }
                    if shouldFollowNewerExplicitRevision(
                        id: id,
                        capturedRevision: revision,
                        localPickStore: localPickStore
                    ) {
                        continue
                    }
                    guard latestExplicitRevision[id] == revision else {
                        queueCapturedRevision(
                            id: id,
                            revision: revision,
                            localPickStore: localPickStore,
                            sessionLease: sessionLease
                        )
                        return .queued
                    }
                } catch {
                    guard isCurrent(sessionLease) else { return .queued }
                    if shouldFollowNewerExplicitRevision(
                        id: id,
                        capturedRevision: revision,
                        localPickStore: localPickStore
                    ) {
                        continue
                    }
                    guard latestExplicitRevision[id] == revision else {
                        queueCapturedRevision(
                            id: id,
                            revision: revision,
                            localPickStore: localPickStore,
                            sessionLease: sessionLease
                        )
                        return .queued
                    }
                }
            }

            if shouldFollowNewerExplicitRevision(
                id: id,
                capturedRevision: revision,
                localPickStore: localPickStore
            ) {
                continue
            }
            guard currentRevision(
                id: id,
                equals: revision,
                localPickStore: localPickStore
            ) else { return .queued }
            if discardSupersededGuest(
                record,
                currentUserID: currentUserID,
                localPickStore: localPickStore,
                sessionLease: sessionLease
            ) {
                return .queued
            }

            do {
                guard isCurrent(sessionLease) else { return .queued }
                let baseVersion = localPickStore.authoritativePick(
                    for: id.raceID,
                    owner: .user(currentUserID)
                )?.version
                let response: PickResponse = try await api.request(
                    .submitPick(
                        raceId: id.raceID,
                        tenthPlaceDriverId: record.selection.tenthPlaceDriverID,
                        winnerDriverId: record.selection.winnerDriverID,
                        dnfDriverId: record.selection.dnfDriverID,
                        baseVersion: baseVersion
                    ),
                    token: token
                )
                guard isCurrent(sessionLease) else { return .queued }
                if shouldFollowNewerExplicitRevision(
                    id: id,
                    capturedRevision: revision,
                    localPickStore: localPickStore
                ) {
                    continue
                }
                guard localPickStore.preserveAuthoritative(
                    response.pick,
                    for: .user(currentUserID)
                ) else {
                    queueCapturedRevision(
                        id: id,
                        revision: revision,
                        localPickStore: localPickStore,
                        sessionLease: sessionLease
                    )
                    return .queued
                }
                return terminalResult(
                    .confirmed,
                    id: id,
                    revision: revision,
                    localPickStore: localPickStore,
                    success: .saved(response.pick),
                    confirmedUserID: currentUserID,
                    sessionLease: sessionLease
                )
            } catch APIError.unauthorized {
                guard isCurrent(sessionLease) else { return .queued }
                queueCapturedRevision(
                    id: id,
                    revision: revision,
                    localPickStore: localPickStore,
                    sessionLease: sessionLease
                )
                reportUnauthorized(rejectedToken: token)
                return .unauthorized
            } catch APIError.serverError(let code, _) where code == 409 {
                guard isCurrent(sessionLease) else { return .queued }
                if shouldFollowNewerExplicitRevision(
                    id: id,
                    capturedRevision: revision,
                    localPickStore: localPickStore
                ) {
                    continue
                }
                let authoritativeResult = await fetchAuthoritativePick(
                    raceID: id.raceID,
                    currentUserID: currentUserID,
                    token: token,
                    localPickStore: localPickStore,
                    sessionLease: sessionLease
                )
                guard isCurrent(sessionLease) else { return .queued }
                let authoritativePick: Pick?
                switch authoritativeResult {
                case .resolved(let pick):
                    authoritativePick = pick
                case .unauthorized:
                    queueCapturedRevision(
                        id: id,
                        revision: revision,
                        localPickStore: localPickStore,
                        sessionLease: sessionLease
                    )
                    reportUnauthorized(rejectedToken: token)
                    return .unauthorized
                }
                return terminalResult(
                    .conflict(.serverWins),
                    id: id,
                    revision: revision,
                    localPickStore: localPickStore,
                    success: .conflict(authoritativePick),
                    sessionLease: sessionLease
                )
            } catch APIError.serverError(let code, _) where code == 423 {
                guard isCurrent(sessionLease) else { return .queued }
                if shouldFollowNewerExplicitRevision(
                    id: id,
                    capturedRevision: revision,
                    localPickStore: localPickStore
                ) {
                    continue
                }
                let authoritativeResult = await fetchAuthoritativePick(
                    raceID: id.raceID,
                    currentUserID: currentUserID,
                    token: token,
                    localPickStore: localPickStore,
                    sessionLease: sessionLease
                )
                guard isCurrent(sessionLease) else { return .queued }
                let authoritativePick: Pick?
                switch authoritativeResult {
                case .resolved(let pick):
                    authoritativePick = pick
                case .unauthorized:
                    queueCapturedRevision(
                        id: id,
                        revision: revision,
                        localPickStore: localPickStore,
                        sessionLease: sessionLease
                    )
                    reportUnauthorized(rejectedToken: token)
                    return .unauthorized
                }
                if shouldFollowNewerExplicitRevision(
                    id: id,
                    capturedRevision: revision,
                    localPickStore: localPickStore
                ) {
                    continue
                }
                return terminalResult(
                    .expired,
                    id: id,
                    revision: revision,
                    localPickStore: localPickStore,
                    success: .expired(authoritativePick),
                    sessionLease: sessionLease
                )
            } catch {
                guard isCurrent(sessionLease) else { return .queued }
                if shouldFollowNewerExplicitRevision(
                    id: id,
                    capturedRevision: revision,
                    localPickStore: localPickStore
                ) {
                    continue
                }
                queueCapturedRevision(
                    id: id,
                    revision: revision,
                    localPickStore: localPickStore,
                    sessionLease: sessionLease
                )
                return .queued
            }
        }
    }

    private func terminalResult(
        _ state: LocalPickSyncState,
        id: LocalPickRecordID,
        revision: UInt64,
        localPickStore: LocalPickStore,
        success: PickSyncResult,
        confirmedUserID: String? = nil,
        sessionLease: SessionLease?
    ) -> PickSyncResult {
        guard isCurrent(sessionLease) else { return .queued }
        if state == .confirmed,
           id.owner == .guest,
           let confirmedUserID,
           let guestRecord = localPickStore.record(id: id),
           guestRecord.revision == revision {
            let accountRecord = localPickStore.record(
                for: id.raceID,
                owner: .user(confirmedUserID)
            )
            if accountRecord == nil || accountRecord?.syncState == .confirmed {
                switch localPickStore.reconcileConfirmed(
                    selection: guestRecord.selection,
                    raceID: id.raceID,
                    owner: .user(confirmedUserID),
                    savedAt: clock.now()
                ) {
                case .saved, .unchanged:
                    break
                case .locked, .invalidOwner, .persistenceFailed:
                    queueCapturedRevision(
                        id: id,
                        revision: revision,
                        localPickStore: localPickStore,
                        sessionLease: sessionLease
                    )
                    return .queued
                }
            }
        }
        guard localPickStore.transition(
            id: id,
            revision: revision,
            to: state
        ) else {
            queueCapturedRevision(
                id: id,
                revision: revision,
                localPickStore: localPickStore,
                sessionLease: sessionLease
            )
            return .queued
        }
        return success
    }

    private func queueCapturedRevision(
        id: LocalPickRecordID,
        revision: UInt64,
        localPickStore: LocalPickStore,
        sessionLease: SessionLease?
    ) {
        guard isCurrent(sessionLease) else { return }
        guard let record = localPickStore.record(id: id),
              record.revision == revision,
              case .syncing = record.syncState
        else { return }
        _ = localPickStore.transition(id: id, revision: revision, to: .queued)
    }

    private func fetchAuthoritativePick(
        raceID: String,
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore,
        sessionLease: SessionLease?
    ) async -> AuthoritativePickResult {
        guard isCurrent(sessionLease) else { return .resolved(nil) }
        do {
            let response: PickResponse = try await api.request(
                .pickForRace(raceId: raceID),
                token: token
            )
            guard isCurrent(sessionLease) else { return .resolved(nil) }
            guard localPickStore.preserveAuthoritative(
                response.pick,
                for: .user(currentUserID)
            ) else { return .resolved(nil) }
            return .resolved(response.pick)
        } catch APIError.unauthorized {
            return .unauthorized
        } catch {
            return .resolved(nil)
        }
    }

    private func discardSupersededGuest(
        _ guestRecord: LocalPickRecord,
        currentUserID: String,
        localPickStore: LocalPickStore,
        sessionLease: SessionLease?
    ) -> Bool {
        guard isCurrent(sessionLease) else { return false }
        guard guestRecord.id.owner == .guest,
              let currentGuest = localPickStore.record(id: guestRecord.id),
              currentGuest.revision == guestRecord.revision,
              let accountRecord = localPickStore.record(
                  for: guestRecord.id.raceID,
                  owner: .user(currentUserID)
              ),
              accountRecord.revision > currentGuest.revision
        else { return false }

        _ = localPickStore.remove(id: guestRecord.id)
        return true
    }

    private func currentRevision(
        id: LocalPickRecordID,
        equals revision: UInt64,
        localPickStore: LocalPickStore
    ) -> Bool {
        localPickStore.record(id: id)?.revision == revision
    }

    private func shouldFollowNewerExplicitRevision(
        id: LocalPickRecordID,
        capturedRevision: UInt64,
        localPickStore: LocalPickStore
    ) -> Bool {
        guard let current = localPickStore.record(id: id),
              current.revision != capturedRevision,
              latestExplicitRevision[id] == current.revision
        else { return false }
        return isProcessable(current.syncState, revision: current.revision)
    }

    private func isEligible(
        _ owner: PickOwnerScope,
        currentUserID: String
    ) -> Bool {
        switch owner {
        case .guest:
            return true
        case .user(let userID):
            return userID == currentUserID
        case .legacyAmbiguous:
            return false
        }
    }

    func isCurrent(
        _ sessionLease: SessionLease?
    ) -> Bool {
        guard !Task.isCancelled else { return false }
        guard let sessionLease else {
            return activeSession == nil && !requiresActiveSession
        }
        return activeSession == sessionLease
    }

    private func activeLease(
        currentUserID: String,
        token: String
    ) -> SessionLease? {
        guard let activeSession,
              activeSession.userID == currentUserID,
              activeSession.token == token
        else { return nil }
        return activeSession
    }

    private func isProcessable(
        _ state: LocalPickSyncState,
        revision: UInt64
    ) -> Bool {
        switch state {
        case .reviewRequired:
            return false
        case .queued:
            return true
        case .syncing(let stateRevision, _):
            return stateRevision == revision
        case .confirmed, .conflict, .expired:
            return false
        }
    }

    private func matches(_ pick: Pick, record: LocalPickRecord) -> Bool {
        pick.winnerDriverId == record.selection.winnerDriverID
            && pick.tenthPlaceDriverId == record.selection.tenthPlaceDriverID
            && pick.dnfDriverId == record.selection.dnfDriverID
    }
}
