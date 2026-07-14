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
    private struct Worker {
        let token: UUID
        let task: Task<PickSyncResult, Never>
    }

    private struct RaceLane {
        let token: UUID
        let task: Task<Void, Never>
    }

    private let api: any APIRequesting
    private let clock: any ClockProviding
    private var workers: [LocalPickRecordID: Worker] = [:]
    private var raceLanes: [String: RaceLane] = [:]
    private var latestExplicitRevision: [LocalPickRecordID: UInt64] = [:]

    init(
        api: any APIRequesting = APIClient(),
        clock: any ClockProviding = SystemClock()
    ) {
        self.api = api
        self.clock = clock
    }

    func submitExplicit(
        id: LocalPickRecordID,
        revision: UInt64,
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore
    ) async -> PickSyncResult {
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
            races: []
        )
    }

    func resumeEligiblePicks(
        currentUserID: String,
        token: String,
        localPickStore: LocalPickStore,
        races: [Race] = []
    ) async {
        for record in localPickStore.queuedRecords(currentUserID: currentUserID) {
            let result = await runOrJoin(
                id: record.id,
                currentUserID: currentUserID,
                token: token,
                localPickStore: localPickStore,
                races: races
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
        races: [Race]
    ) async -> PickSyncResult {
        if let worker = workers[id] {
            return await worker.task.value
        }

        let previousLane = raceLanes[id.raceID]?.task
        let laneToken = UUID()
        let workerToken = UUID()
        let task = Task { @MainActor [weak self] in
            await previousLane?.value
            guard let self else { return PickSyncResult.queued }
            let result = await self.runWorker(
                id: id,
                currentUserID: currentUserID,
                token: token,
                localPickStore: localPickStore,
                races: races
            )
            self.finishWorker(id: id, token: workerToken)
            return result
        }
        workers[id] = Worker(token: workerToken, task: task)
        let laneTask = Task { @MainActor [weak self] in
            _ = await task.value
            self?.finishRaceLane(raceID: id.raceID, token: laneToken)
        }
        raceLanes[id.raceID] = RaceLane(token: laneToken, task: laneTask)
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
        races: [Race]
    ) async -> PickSyncResult {
        while true {
            guard let record = localPickStore.record(id: id),
                  isEligible(record.id.owner, currentUserID: currentUserID),
                  isProcessable(record.syncState, revision: record.revision)
            else { return .queued }

            if discardSupersededGuest(
                record,
                currentUserID: currentUserID,
                localPickStore: localPickStore
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
                        success: .expired(nil)
                    )
                }

                do {
                    let response: PickResponse = try await api.request(
                        .pickForRace(raceId: id.raceID),
                        token: token
                    )
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
                        localPickStore: localPickStore
                    ) {
                        return .queued
                    }

                    if matches(response.pick, record: record) {
                        return terminalResult(
                            .confirmed,
                            id: id,
                            revision: revision,
                            localPickStore: localPickStore,
                            success: .saved(response.pick),
                            confirmedUserID: currentUserID
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
                            success: .conflict(response.pick)
                        )
                    }
                } catch APIError.notFound {
                    // A missing server pick is the only automatic path to POST.
                } catch APIError.unauthorized {
                    queueCapturedRevision(
                        id: id,
                        revision: revision,
                        localPickStore: localPickStore
                    )
                    return .unauthorized
                } catch APIError.serverError(let code, _) where code == 423 {
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
                            localPickStore: localPickStore
                        )
                        return .queued
                    }
                } catch {
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
                            localPickStore: localPickStore
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
                localPickStore: localPickStore
            ) {
                return .queued
            }

            do {
                let response: PickResponse = try await api.request(
                    .submitPick(
                        raceId: id.raceID,
                        tenthPlaceDriverId: record.selection.tenthPlaceDriverID,
                        winnerDriverId: record.selection.winnerDriverID,
                        dnfDriverId: record.selection.dnfDriverID
                    ),
                    token: token
                )
                if shouldFollowNewerExplicitRevision(
                    id: id,
                    capturedRevision: revision,
                    localPickStore: localPickStore
                ) {
                    continue
                }
                return terminalResult(
                    .confirmed,
                    id: id,
                    revision: revision,
                    localPickStore: localPickStore,
                    success: .saved(response.pick),
                    confirmedUserID: currentUserID
                )
            } catch APIError.unauthorized {
                queueCapturedRevision(
                    id: id,
                    revision: revision,
                    localPickStore: localPickStore
                )
                return .unauthorized
            } catch APIError.serverError(let code, _) where code == 423 {
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
                    success: .expired(nil)
                )
            } catch {
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
                    localPickStore: localPickStore
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
        confirmedUserID: String? = nil
    ) -> PickSyncResult {
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
                        localPickStore: localPickStore
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
                localPickStore: localPickStore
            )
            return .queued
        }
        return success
    }

    private func queueCapturedRevision(
        id: LocalPickRecordID,
        revision: UInt64,
        localPickStore: LocalPickStore
    ) {
        guard let record = localPickStore.record(id: id),
              record.revision == revision,
              case .syncing = record.syncState
        else { return }
        _ = localPickStore.transition(id: id, revision: revision, to: .queued)
    }

    private func discardSupersededGuest(
        _ guestRecord: LocalPickRecord,
        currentUserID: String,
        localPickStore: LocalPickStore
    ) -> Bool {
        guard guestRecord.id.owner == .guest,
              let currentGuest = localPickStore.record(id: guestRecord.id),
              currentGuest.revision == guestRecord.revision,
              let accountRecord = localPickStore.record(
                  for: guestRecord.id.raceID,
                  owner: .user(currentUserID)
              ),
              accountRecord.revision > currentGuest.revision
        else { return false }

        _ = localPickStore.remove(raceId: guestRecord.id.raceID)
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

    private func isProcessable(
        _ state: LocalPickSyncState,
        revision: UInt64
    ) -> Bool {
        switch state {
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
