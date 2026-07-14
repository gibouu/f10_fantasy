import Foundation

enum PickSubmissionState: Equatable {
    case idle
    case savingLocally
    case savedOnDevice
    case syncing
    case savedToAccount
    case conflict
    case expired
}

@Observable
@MainActor
final class RaceDetailViewModel {
    private(set) var race: Race
    private(set) var entrants: [Driver] = []
    private(set) var results: [RaceResult] = []
    private(set) var qualifyingResults: [QualifyingResultRow] = []
    private(set) var serverPick: Pick?

    private(set) var selectedWinnerID: String?
    private(set) var selectedP10ID: String?
    private(set) var selectedDNFID: String?

    private(set) var submissionState: PickSubmissionState = .idle
    private(set) var isLoading = false
    private(set) var loadErrorMessage: String?
    private(set) var submissionErrorMessage: String?

    var selectedWinner: Driver? { resolve(selectedWinnerID) }
    var selectedP10: Driver? { resolve(selectedP10ID) }
    var selectedDNF: Driver? { resolve(selectedDNFID) }

    var isSubmitting: Bool {
        submissionState == .savingLocally || submissionState == .syncing
    }

    var submitSuccess: Bool {
        submissionState == .savedOnDevice || submissionState == .savedToAccount
    }

    var isLocalOnly: Bool {
        switch submissionState {
        case .savedOnDevice, .syncing, .conflict, .expired:
            return true
        case .idle, .savingLocally, .savedToAccount:
            return false
        }
    }

    var errorMessage: String? {
        submissionErrorMessage ?? loadErrorMessage
    }

    var canSave: Bool {
        guard clock.now() < race.lockCutoffUtc,
              let selectedWinner,
              let selectedP10,
              let selectedDNF
        else { return false }
        return Set([selectedWinner.id, selectedP10.id, selectedDNF.id]).count == 3
    }

    private enum SessionScope: Equatable, Sendable {
        case device
        case user(String)

        var owner: PickOwnerScope {
            switch self {
            case .device:
                return .guest
            case .user(let userID):
                return .user(userID)
            }
        }

        var userID: String? {
            guard case .user(let userID) = self else { return nil }
            return userID
        }
    }

    private enum PublicRefreshOutcome: Sendable {
        case success(RaceDetailSnapshot)
        case failure(String)
    }

    private enum PrivatePickOutcome: Sendable {
        case success(Pick)
        case missing
        case unavailable
    }

    private enum HydrationEvent: Sendable {
        case cache(RaceDetailSnapshot?)
        case publicRefresh(PublicRefreshOutcome)
        case privatePick(PrivatePickOutcome)
    }

    private struct LoadFlight {
        let token: UUID
        let generation: UInt64
        let scope: SessionScope
        let task: Task<Void, Never>
    }

    private let raceID: String
    private let repository: any RaceRepositoryProtocol
    private let api: any APIRequesting
    private let syncManager: SyncManager
    private let clock: any ClockProviding

    private var loadGeneration: UInt64 = 0
    private var draftGeneration: UInt64 = 0
    private var activeScope: SessionScope?
    private var hasLoaded = false
    private var hasUnsavedEdits = false
    private var lastObservedVisibleRecord: LocalPickRecord?
    private var loadFlight: LoadFlight?

    init(
        summary: Race,
        repository: any RaceRepositoryProtocol,
        api: any APIRequesting,
        syncManager: SyncManager,
        clock: any ClockProviding
    ) {
        race = summary
        raceID = summary.id
        self.repository = repository
        self.api = api
        self.syncManager = syncManager
        self.clock = clock
    }

    /// Refreshes list-owned race fields without replacing per-race detail or
    /// the user's in-progress three-pick draft.
    func updateSummary(_ summary: Race) {
        guard summary.id == raceID else { return }
        race = summary
    }

    // MARK: - Load

    func loadIfNeeded(
        token: String?,
        userID: String?,
        localPickStore: LocalPickStore,
        force: Bool = false
    ) async {
        let scope = sessionScope(token: token, userID: userID)

        if !force,
           let flight = loadFlight,
           flight.scope == scope {
            await flight.task.value
            return
        }

        if !force, hasLoaded, activeScope == scope {
            let currentVisibleRecord = visibleRecord(
                scope: scope,
                localPickStore: localPickStore
            )
            if currentVisibleRecord != lastObservedVisibleRecord {
                hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
            }
            return
        }

        await startLoad(
            token: token,
            scope: scope,
            localPickStore: localPickStore,
            policy: force ? .force : .ifStale
        )
    }

    func refresh(
        token: String?,
        userID: String?,
        localPickStore: LocalPickStore
    ) async {
        await startLoad(
            token: token,
            scope: sessionScope(token: token, userID: userID),
            localPickStore: localPickStore,
            policy: .force
        )
    }

    func reconcileLocalState(
        token: String?,
        userID: String?,
        localPickStore: LocalPickStore
    ) {
        let scope = sessionScope(token: token, userID: userID)
        guard activeScope == scope else { return }
        let currentVisibleRecord = visibleRecord(
            scope: scope,
            localPickStore: localPickStore
        )
        guard currentVisibleRecord != lastObservedVisibleRecord else { return }
        hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
    }

    private func startLoad(
        token: String?,
        scope: SessionScope,
        localPickStore: LocalPickStore,
        policy: RaceFetchPolicy
    ) async {
        loadFlight?.task.cancel()
        loadGeneration &+= 1
        let generation = loadGeneration
        let flightToken = UUID()

        prepare(scope: scope, localPickStore: localPickStore)
        let capturedDraftGeneration = draftGeneration

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performLoad(
                token: token,
                scope: scope,
                localPickStore: localPickStore,
                policy: policy,
                generation: generation,
                capturedDraftGeneration: capturedDraftGeneration
            )
        }
        loadFlight = LoadFlight(
            token: flightToken,
            generation: generation,
            scope: scope,
            task: task
        )

        await task.value
        finishLoadFlight(token: flightToken, generation: generation)
    }

    private func performLoad(
        token: String?,
        scope: SessionScope,
        localPickStore: LocalPickStore,
        policy: RaceFetchPolicy,
        generation: UInt64,
        capturedDraftGeneration: UInt64
    ) async {
        guard generation == loadGeneration, activeScope == scope else { return }
        isLoading = true
        loadErrorMessage = nil

        let repository = repository
        let api = api
        let raceID = raceID
        let authenticatedUserID = scope.userID
        let shouldRequestPrivatePick = authenticatedUserID != nil
            && token != nil
            && !hasDirtyVisibleDraft(scope: scope, localPickStore: localPickStore)
        let capturedVisibleRecord = visibleRecord(
            scope: scope,
            localPickStore: localPickStore
        )

        await withTaskGroup(of: HydrationEvent.self) { group in
            group.addTask {
                .cache(await repository.cachedDetail(id: raceID))
            }
            group.addTask {
                do {
                    return .publicRefresh(
                        .success(
                            try await repository.refreshDetail(
                                id: raceID,
                                policy: policy
                            )
                        )
                    )
                } catch {
                    return .publicRefresh(.failure(error.localizedDescription))
                }
            }
            if shouldRequestPrivatePick, let token {
                group.addTask {
                    do {
                        let response: PickResponse = try await api.request(.pickForRace(raceId: raceID), token: token)
                        return .privatePick(.success(response.pick))
                    } catch APIError.notFound {
                        return .privatePick(.missing)
                    } catch {
                        return .privatePick(.unavailable)
                    }
                }
            }

            var cacheArrived = false
            var publicRefreshArrived = false
            var detailAvailable = false
            var deferredPublicOutcome: PublicRefreshOutcome?
            var deferredPrivateOutcome: PrivatePickOutcome?

            for await event in group {
                guard generation == loadGeneration, activeScope == scope else {
                    continue
                }

                switch event {
                case .cache(let snapshot):
                    cacheArrived = true
                    if let snapshot {
                        applyDetail(snapshot, generation: generation)
                        detailAvailable = true
                    }
                    if let deferredPublicOutcome {
                        applyPublicOutcome(
                            deferredPublicOutcome,
                            generation: generation
                        )
                        if case .success = deferredPublicOutcome {
                            detailAvailable = true
                        }
                        publicRefreshArrived = true
                    }
                    deferredPublicOutcome = nil
                    if (detailAvailable || publicRefreshArrived),
                       let outcome = deferredPrivateOutcome {
                        applyPrivateOutcome(
                            outcome,
                            scope: scope,
                            localPickStore: localPickStore,
                            generation: generation,
                            capturedDraftGeneration: capturedDraftGeneration,
                            capturedVisibleRecord: capturedVisibleRecord
                        )
                        deferredPrivateOutcome = nil
                    }

                case .publicRefresh(let outcome):
                    if cacheArrived {
                        applyPublicOutcome(outcome, generation: generation)
                        if case .success = outcome {
                            detailAvailable = true
                        }
                        publicRefreshArrived = true
                        if let deferredPrivateOutcome {
                            applyPrivateOutcome(
                                deferredPrivateOutcome,
                                scope: scope,
                                localPickStore: localPickStore,
                                generation: generation,
                                capturedDraftGeneration: capturedDraftGeneration,
                                capturedVisibleRecord: capturedVisibleRecord
                            )
                        }
                        deferredPrivateOutcome = nil
                    } else {
                        deferredPublicOutcome = outcome
                    }

                case .privatePick(let outcome):
                    if detailAvailable || publicRefreshArrived {
                        applyPrivateOutcome(
                            outcome,
                            scope: scope,
                            localPickStore: localPickStore,
                            generation: generation,
                            capturedDraftGeneration: capturedDraftGeneration,
                            capturedVisibleRecord: capturedVisibleRecord
                        )
                    } else {
                        deferredPrivateOutcome = outcome
                    }
                }
            }
        }

        guard generation == loadGeneration, activeScope == scope else { return }
        if visibleRecord(scope: scope, localPickStore: localPickStore)
            != capturedVisibleRecord {
            hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
        }
        guard generation == loadGeneration, activeScope == scope else { return }
        hasLoaded = true
        isLoading = false
    }

    private func applyDetail(
        _ snapshot: RaceDetailSnapshot,
        generation: UInt64
    ) {
        guard generation == loadGeneration, snapshot.race.id == raceID else { return }
        race = snapshot.race
        entrants = snapshot.entrants
        results = snapshot.results
        qualifyingResults = snapshot.qualifyingResults
    }

    private func applyPublicOutcome(
        _ outcome: PublicRefreshOutcome,
        generation: UInt64
    ) {
        guard generation == loadGeneration else { return }
        switch outcome {
        case .success(let snapshot):
            applyDetail(snapshot, generation: generation)
            guard generation == loadGeneration else { return }
            loadErrorMessage = nil
        case .failure(let message):
            loadErrorMessage = message
        }
    }

    private func applyPrivateOutcome(
        _ outcome: PrivatePickOutcome,
        scope: SessionScope,
        localPickStore: LocalPickStore,
        generation: UInt64,
        capturedDraftGeneration: UInt64,
        capturedVisibleRecord: LocalPickRecord?
    ) {
        guard generation == loadGeneration,
              activeScope == scope,
              capturedDraftGeneration == draftGeneration,
              !hasUnsavedEdits
        else { return }

        let currentVisibleRecord = visibleRecord(
            scope: scope,
            localPickStore: localPickStore
        )
        guard currentVisibleRecord == capturedVisibleRecord else {
            hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
            return
        }
        guard !hasDirtyVisibleDraft(
            scope: scope,
            localPickStore: localPickStore
        ) else { return }

        switch outcome {
        case .success(let pick):
            let selection = PickSelection(
                winnerDriverID: pick.winnerDriverId,
                tenthPlaceDriverID: pick.tenthPlaceDriverId,
                dnfDriverID: pick.dnfDriverId
            )
            if case .user(let userID) = scope,
               currentVisibleRecord?.id.owner == .user(userID),
               currentVisibleRecord?.syncState == .confirmed {
                let reconciliation = localPickStore.reconcileConfirmed(
                    selection: selection,
                    raceID: raceID,
                    owner: .user(userID),
                    savedAt: clock.now()
                )
                switch reconciliation {
                case .saved(let record), .unchanged(let record):
                    lastObservedVisibleRecord = record
                case .invalidOwner, .persistenceFailed, .locked:
                    break
                }
            }
            serverPick = pick
            (
                selectedWinnerID,
                selectedP10ID,
                selectedDNFID
            ) = (
                pick.winnerDriverId,
                pick.tenthPlaceDriverId,
                pick.dnfDriverId
            )
            submissionState = .savedToAccount
            submissionErrorMessage = nil
        case .missing:
            serverPick = nil
            if visibleRecord(scope: scope, localPickStore: localPickStore) != nil {
                hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
            } else {
                (selectedWinnerID, selectedP10ID, selectedDNFID) = (nil, nil, nil)
                submissionState = .idle
                submissionErrorMessage = nil
            }
        case .unavailable:
            break
        }
    }

    private func finishLoadFlight(token: UUID, generation: UInt64) {
        guard generation == loadGeneration,
              loadFlight?.token == token,
              loadFlight?.generation == generation
        else { return }
        loadFlight = nil
    }

    // MARK: - Selection

    func select(driver: Driver, for slot: PickSlot) {
        guard clock.now() < race.lockCutoffUtc else {
            submissionErrorMessage = "This race is now locked — picks can no longer be changed."
            Haptics.locked()
            return
        }

        switch slot {
        case .winner:
            selectedWinnerID = driver.id
        case .p10:
            selectedP10ID = driver.id
        case .dnf:
            selectedDNFID = driver.id
        }
        draftGeneration &+= 1
        hasUnsavedEdits = true
        submissionState = .idle
        submissionErrorMessage = nil
    }

    // MARK: - Submit

    func submit(
        token: String?,
        userID: String?,
        localPickStore: LocalPickStore
    ) async {
        guard canSave,
              let selectedWinnerID,
              let selectedP10ID,
              let selectedDNFID
        else { return }

        let scope = sessionScope(token: token, userID: userID)
        if let activeScope, activeScope != scope {
            switchScope(
                to: scope,
                localPickStore: localPickStore,
                invalidatingLoad: true
            )
            submissionErrorMessage = "Your account changed. Please confirm your picks again."
            return
        }
        activeScope = scope

        guard clock.now() < race.lockCutoffUtc else {
            submissionState = .expired
            submissionErrorMessage = "This race is now locked."
            Haptics.locked()
            return
        }

        let selection = PickSelection(
            winnerDriverID: selectedWinnerID,
            tenthPlaceDriverID: selectedP10ID,
            dnfDriverID: selectedDNFID
        )
        let visibleBeforeSave = visibleRecord(
            scope: scope,
            localPickStore: localPickStore
        )
        let supersedesDirtyGuest = visibleBeforeSave?.id.owner == .guest
            && visibleBeforeSave.map { isDirty($0.syncState) } == true
        draftGeneration &+= 1
        let capturedDraftGeneration = draftGeneration
        let priorState = submissionState
        submissionState = .savingLocally
        submissionErrorMessage = nil

        let saveResult = localPickStore.save(
            selection: selection,
            race: race,
            owner: scope.owner,
            now: clock.now(),
            forceNewRevision: supersedesDirtyGuest || (serverPick.map {
                !matches($0, selection: selection)
            } ?? false)
        )

        let record: LocalPickRecord
        switch saveResult {
        case .saved(let saved), .unchanged(let saved):
            record = saved
        case .locked:
            submissionState = .expired
            submissionErrorMessage = "This race is now locked."
            Haptics.locked()
            return
        case .invalidOwner, .persistenceFailed:
            submissionState = priorState
            submissionErrorMessage = "Your picks could not be saved on this device. Please try again."
            return
        }

        hasUnsavedEdits = false
        lastObservedVisibleRecord = record

        guard case .user(let currentUserID) = scope,
              let token
        else {
            submissionState = .savedOnDevice
            Haptics.success()
            return
        }

        if record.syncState == .confirmed {
            submissionState = .savedToAccount
            Haptics.success()
            return
        }

        submissionState = .savedOnDevice
        await Task.yield()
        guard activeScope == scope,
              capturedDraftGeneration == draftGeneration,
              selectedWinnerID == selection.winnerDriverID,
              selectedP10ID == selection.tenthPlaceDriverID,
              selectedDNFID == selection.dnfDriverID
        else { return }
        guard let currentBeforeSync = localPickStore.record(id: record.id),
              currentBeforeSync.revision == record.revision,
              currentBeforeSync.selection == selection
        else {
            hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
            return
        }
        lastObservedVisibleRecord = currentBeforeSync

        if applyTerminalState(from: currentBeforeSync, serverPick: nil) {
            return
        }

        submissionState = .syncing
        let result = await syncManager.submitExplicit(
            id: record.id,
            revision: record.revision,
            currentUserID: currentUserID,
            token: token,
            localPickStore: localPickStore
        )

        guard activeScope == scope,
              capturedDraftGeneration == draftGeneration,
              selectedWinnerID == selection.winnerDriverID,
              selectedP10ID == selection.tenthPlaceDriverID,
              selectedDNFID == selection.dnfDriverID
        else { return }
        guard let currentRecord = localPickStore.record(id: record.id),
              currentRecord.revision == record.revision,
              currentRecord.selection == selection
        else {
            hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
            return
        }
        lastObservedVisibleRecord = currentRecord

        let resultPick: Pick?
        switch result {
        case .saved(let pick), .conflict(let pick?), .expired(let pick?):
            resultPick = pick
        case .conflict(nil), .expired(nil), .queued, .unauthorized:
            resultPick = nil
        }
        if applyTerminalState(from: currentRecord, serverPick: resultPick) {
            return
        }

        switch result {
        case .saved:
            submissionState = .savedOnDevice
        case .queued, .unauthorized:
            submissionState = .savedOnDevice
            submissionErrorMessage = "Saved on this device — will sync when your account is available."
            Haptics.success()
        case .conflict(let pick):
            serverPick = pick
            submissionState = .conflict
            submissionErrorMessage = "Your account has a different pick. Your device copy is still safe."
        case .expired(let pick):
            serverPick = pick
            submissionState = .expired
            submissionErrorMessage = "This race is locked. Your device copy was retained."
            Haptics.locked()
        }
    }

    @discardableResult
    private func applyTerminalState(
        from record: LocalPickRecord,
        serverPick returnedPick: Pick?
    ) -> Bool {
        switch record.syncState {
        case .confirmed:
            if let returnedPick {
                serverPick = returnedPick
            } else if let serverPick,
                      !matches(serverPick, selection: record.selection) {
                self.serverPick = nil
            }
            submissionState = .savedToAccount
            submissionErrorMessage = nil
            Haptics.success()
            return true
        case .conflict:
            if let returnedPick {
                serverPick = returnedPick
            }
            submissionState = .conflict
            submissionErrorMessage = "Your account has a different pick. Your device copy is still safe."
            return true
        case .expired:
            if let returnedPick {
                serverPick = returnedPick
            }
            submissionState = .expired
            submissionErrorMessage = "This race is locked. Your device copy was retained."
            Haptics.locked()
            return true
        case .queued, .syncing:
            return false
        }
    }

    // MARK: - Local state

    private func prepare(
        scope: SessionScope,
        localPickStore: LocalPickStore
    ) {
        if let activeScope, activeScope != scope {
            switchScope(
                to: scope,
                localPickStore: localPickStore,
                invalidatingLoad: false
            )
        } else {
            activeScope = scope
            let currentVisibleRecord = visibleRecord(
                scope: scope,
                localPickStore: localPickStore
            )
            if currentVisibleRecord != lastObservedVisibleRecord {
                hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
            }
        }
    }

    private func switchScope(
        to scope: SessionScope,
        localPickStore: LocalPickStore,
        invalidatingLoad: Bool
    ) {
        if invalidatingLoad {
            loadFlight?.task.cancel()
            loadGeneration &+= 1
            loadFlight = nil
            isLoading = false
        }
        activeScope = scope
        draftGeneration &+= 1
        hasLoaded = false
        hasUnsavedEdits = false
        lastObservedVisibleRecord = nil
        serverPick = nil
        (selectedWinnerID, selectedP10ID, selectedDNFID) = (nil, nil, nil)
        submissionState = .idle
        loadErrorMessage = nil
        submissionErrorMessage = nil
        hydrateLocalDraft(scope: scope, localPickStore: localPickStore)
    }

    private func hydrateLocalDraft(
        scope: SessionScope,
        localPickStore: LocalPickStore
    ) {
        guard !hasUnsavedEdits else { return }
        let record = visibleRecord(
            scope: scope,
            localPickStore: localPickStore
        )
        lastObservedVisibleRecord = record
        guard let record else {
            if serverPick == nil {
                submissionState = .idle
            }
            return
        }

        (
            selectedWinnerID,
            selectedP10ID,
            selectedDNFID
        ) = (
            record.selection.winnerDriverID,
            record.selection.tenthPlaceDriverID,
            record.selection.dnfDriverID
        )
        applyHydratedSubmissionState(
            record.syncState,
            scope: scope
        )
        if record.syncState == .confirmed,
           let serverPick,
           !matches(serverPick, selection: record.selection) {
            self.serverPick = nil
        }
    }

    private func visibleRecord(
        scope: SessionScope,
        localPickStore: LocalPickStore
    ) -> LocalPickRecord? {
        switch scope {
        case .device:
            return localPickStore.record(for: raceID, owner: .guest)
        case .user(let userID):
            let userRecord = localPickStore.record(
                for: raceID,
                owner: .user(userID)
            )
            let guestRecord = localPickStore.record(
                for: raceID,
                owner: .guest
            )
            if let userRecord, isDirty(userRecord.syncState) {
                return userRecord
            }
            if let guestRecord, isDirty(guestRecord.syncState) {
                return guestRecord
            }
            return userRecord
        }
    }

    private func hasDirtyVisibleDraft(
        scope: SessionScope,
        localPickStore: LocalPickStore
    ) -> Bool {
        guard let record = visibleRecord(
            scope: scope,
            localPickStore: localPickStore
        ) else { return hasUnsavedEdits }

        return hasUnsavedEdits || isDirty(record.syncState)
    }

    private func isDirty(_ state: LocalPickSyncState) -> Bool {
        switch state {
        case .confirmed:
            return false
        case .queued, .syncing, .conflict, .expired:
            return true
        }
    }

    private func submissionState(
        for localState: LocalPickSyncState
    ) -> PickSubmissionState {
        switch localState {
        case .queued:
            return .savedOnDevice
        case .syncing:
            return .syncing
        case .confirmed:
            return .savedToAccount
        case .conflict:
            return .conflict
        case .expired:
            return .expired
        }
    }

    private func applyHydratedSubmissionState(
        _ localState: LocalPickSyncState,
        scope: SessionScope
    ) {
        submissionState = submissionState(for: localState)
        switch localState {
        case .queued:
            if case .user = scope {
                submissionErrorMessage = "Saved on this device — will sync when your account is available."
            } else {
                submissionErrorMessage = nil
            }
        case .syncing, .confirmed:
            submissionErrorMessage = nil
        case .conflict:
            submissionErrorMessage = "Your account has a different pick. Your device copy is still safe."
        case .expired:
            submissionErrorMessage = "This race is locked. Your device copy was retained."
        }
    }

    private func sessionScope(token: String?, userID: String?) -> SessionScope {
        guard token != nil, let userID else { return .device }
        return .user(userID)
    }

    private func resolve(_ driverID: String?) -> Driver? {
        guard let driverID else { return nil }
        return entrants.first { $0.id == driverID }
    }

    private func matches(_ pick: Pick, selection: PickSelection) -> Bool {
        pick.winnerDriverId == selection.winnerDriverID
            && pick.tenthPlaceDriverId == selection.tenthPlaceDriverID
            && pick.dnfDriverId == selection.dnfDriverID
    }
}
