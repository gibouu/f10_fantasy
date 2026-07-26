import SwiftUI

private struct RaceSelectionPerformanceSpan {
    let token: UUID
    let raceID: String
    let interval: FXPerformanceSpan
}

struct RaceDeckView: View {
    @Bindable var viewModel: RaceDeckViewModel
    let legacyRecoveryPresentationSession: LegacyRecoveryPresentationSession
    let section: RaceDeckSection

    @Environment(AuthManager.self) private var authManager
    @Environment(LocalPickStore.self) private var localPickStore
    @Environment(TutorialStore.self) private var tutorialStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.displayScale) private var displayScale
    @Environment(\.fxImagePipeline) private var imagePipeline
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var selectedDetail: RaceDetailViewModel?
    @State private var selectedDetailScopeID: String?
    @State private var scheduledRace: Race?
    @State private var pickerState = DriverPickerState(
        activeSlot: .winner,
        selectedDriverIDs: [:],
        isLocked: false
    )
    @State private var isShowingPicker = false
    @State private var isShowingSignIn = false
    @State private var pickerPresentationInterval: FXPerformanceSpan?
    @State private var schedulePresentationInterval: FXPerformanceSpan?
    @State private var raceSelectionReadySpan: RaceSelectionPerformanceSpan?
    @State private var imagePrefetchOwnerID: UUID?
    @State private var foregroundRefreshTask: Task<Void, Never>?
    @State private var legacyRecoveryPresentation: LegacyRecoveryPresentation?
    @State private var legacyRecoveryErrorMessage: String?

    private var races: [Race] {
        switch section {
        case .upcoming: viewModel.upcoming
        case .past: viewModel.past
        }
    }

    private var selectedRaceID: String? {
        switch section {
        case .upcoming: viewModel.selectedUpcomingID
        case .past: viewModel.selectedPastID
        }
    }

    private var selectedRace: Race? {
        guard let selectedRaceID else { return races.first }
        return races.first { $0.id == selectedRaceID } ?? races.first
    }

    private var privateScopeID: String {
        authManager.authenticatedUser.map { "user:\($0.id)" } ?? "device"
    }

    private var legacyRecoveryAccountContext: LegacyRecoveryAccountContext {
        LegacyRecoveryAccountContext.resolve(authState: authManager.state)
    }

    private var scopedSelectedDetail: RaceDetailViewModel? {
        guard selectedDetailScopeID == privateScopeID else { return nil }
        return selectedDetail
    }

    private var selection: Binding<String?> {
        Binding(
            get: { selectedRaceID },
            set: { newID in
                beginRaceSelection(to: newID)
                switch section {
                case .upcoming:
                    viewModel.selectedUpcomingID = newID
                case .past:
                    viewModel.selectedPastID = newID
                }
            }
        )
    }

    private var observedGuestRecord: LocalPickRecord? {
        guard let selectedRaceID else { return nil }
        return localPickStore.record(for: selectedRaceID, owner: .guest)
    }

    private var observedAccountRecord: LocalPickRecord? {
        guard let selectedRaceID,
              let userID = authManager.authenticatedUser?.id
        else { return nil }
        return localPickStore.record(for: selectedRaceID, owner: .user(userID))
    }

    private var observedLegacyRecord: LocalPickRecord? {
        guard let selectedRaceID else { return nil }
        return localPickStore.legacyConflict(for: selectedRaceID)
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.races.isEmpty {
                loadingState
            } else if let error = viewModel.errorMessage, viewModel.races.isEmpty {
                RetryView(message: error) {
                    await viewModel.refresh(policy: .force)
                }
            } else if races.isEmpty {
                emptyState
            } else {
                deck
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("race-deck")
        .sheet(item: $scheduledRace) { race in
            RaceScheduleSheet(race: race)
                .onAppear { finishSchedulePresentation() }
        }
        .sheet(isPresented: $isShowingPicker) {
            if let detail = scopedSelectedDetail {
                DriverPickerSheet(
                    state: $pickerState,
                    entrants: detail.entrants
                ) { driver, slot in
                    commitSelection(driver, for: slot, detail: detail)
                } onRetryCommit: {
                    retryCurrentSelectionCommit(detail: detail)
                }
                .accessibilityIdentifier("driver-picker")
                .onAppear { finishPickerPresentation() }
            }
        }
        .sheet(isPresented: $isShowingSignIn) {
            SignInPromptView(
                reason: "Sign in to sync your picks and track your score against friends."
            )
        }
        .sheet(
            item: $legacyRecoveryPresentation,
            onDismiss: { dismissLegacyRecovery() }
        ) { presentation in
            legacyRecoverySheet(presentation)
        }
        .task(id: detailTaskKey) {
            await loadSelectedDetail()
        }
        .task(id: legacyRecoveryTaskKey) {
            _ = presentLegacyRecoveryIfNeeded()
        }
        .task(id: imagePrefetchTaskKey) {
            let previousOwnerID = imagePrefetchOwnerID
            imagePrefetchOwnerID = nil
            if let previousOwnerID {
                await imagePipeline.clearPrefetchScope(ownerID: previousOwnerID)
            }
            guard !Task.isCancelled else { return }

            let requests = await viewModel.activeImagePrefetchRequests(
                displayScale: displayScale
            )
            guard !Task.isCancelled else { return }
            let ownerID = UUID()
            await imagePipeline.replacePrefetchScope(
                with: requests,
                ownerID: ownerID
            )
            guard !Task.isCancelled else {
                await imagePipeline.clearPrefetchScope(ownerID: ownerID)
                return
            }
            imagePrefetchOwnerID = ownerID
        }
        .task(id: isShowingPicker) {
            await monitorPickerLock()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                refreshSelectedDetail()
            } else {
                foregroundRefreshTask?.cancel()
                foregroundRefreshTask = nil
                scopedSelectedDetail?.cancelLoad()
            }
        }
        .onChange(of: viewModel.liveDetailRefreshRevision) { _, _ in
            guard selectedRace?.status == .live else { return }
            refreshSelectedDetail()
        }
        .onChange(of: observedGuestRecord) { _, _ in
            reconcileSelectedDetail()
        }
        .onChange(of: observedAccountRecord) { _, _ in
            reconcileSelectedDetail()
        }
        .onChange(of: isShowingPicker) { _, isPresented in
            if !isPresented { finishPickerPresentation() }
        }
        .onChange(of: scopedSelectedDetail?.serverPick?.scoreBreakdown?.totalScore) { _, score in
            if score != nil, scopedSelectedDetail?.race.status == .completed {
                Haptics.scoreReveal()
            }
        }
        .onChange(of: privateScopeID) { _, _ in
            foregroundRefreshTask?.cancel()
            foregroundRefreshTask = nil
            isShowingPicker = false
            dismissLegacyRecovery()
        }
        .onChange(of: viewModel.transitionedRaceID) { _, raceID in
            guard let raceID else { return }
            isShowingPicker = false
            scheduledRace = nil
            let raceName = viewModel.races.first { $0.id == raceID }?.name ?? "Race"
            AccessibilityNotification.Announcement(
                "\(raceName) is complete. Results are now available in Past."
            ).post()
            viewModel.clearTransitionedRaceID()
        }
        .onDisappear {
            foregroundRefreshTask?.cancel()
            foregroundRefreshTask = nil
            selectedDetail?.cancelLoad()
            selectedDetail = nil
            selectedDetailScopeID = nil
            finishPickerPresentation()
            finishSchedulePresentation()
            dismissLegacyRecovery()
            abandonRaceSelection()
            let ownerID = imagePrefetchOwnerID
            imagePrefetchOwnerID = nil
            if let ownerID {
                Task { await imagePipeline.clearPrefetchScope(ownerID: ownerID) }
            }
        }
    }

    private var detailTaskKey: String {
        [
            section == .upcoming ? "upcoming" : "past",
            selectedRaceID ?? "none",
            privateScopeID,
        ].joined(separator: ":")
    }

    private var imagePrefetchTaskKey: String {
        [
            section == .upcoming ? "upcoming" : "past",
            viewModel.imagePrefetchCohortKey,
            String(describing: displayScale),
        ].joined(separator: ":")
    }

    private var legacyRecoveryTaskKey: String {
        [
            section == .upcoming ? "upcoming" : "past",
            selectedRaceID ?? "none",
            privateScopeID,
            observedLegacyRecord.map { String($0.revision) } ?? "none",
            scopedSelectedDetail.map { String($0.entrants.count) } ?? "0",
            scopedSelectedDetail.map { String(describing: $0.privatePickAuthority) }
                ?? "not-ready",
            String(describing: legacyRecoveryAccountContext),
        ].joined(separator: ":")
    }

    private var deck: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                if let staleError = viewModel.staleErrorMessage {
                    ErrorBanner(message: staleError) {
                        viewModel.dismissStaleError()
                    }
                    .padding(.horizontal, 18)
                }

                CenteredRacePager(
                    items: races,
                    selection: selection,
                    itemAccessibilityLabel: { $0.name }
                ) { race in
                    raceCard(race)
                }
                .accessibilityIdentifier(
                    section == .upcoming ? "race-pager-upcoming" : "race-pager-past"
                )
                .frame(minHeight: section == .upcoming ? 448 : 380)

                if let race = selectedRace,
                   let detail = scopedSelectedDetail,
                   detail.race.id == race.id {
                    #if FX_PERF_HARNESS
                    // Must sit *above* RaceContextView. This is a LazyVStack,
                    // so anything below the tall season-form table is not
                    // instantiated and the marker never reaches the
                    // accessibility tree for the harness to find.
                    if !detail.entrants.isEmpty {
                        Color.clear
                            .frame(width: 1, height: 1)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("Race details ready")
                            .accessibilityIdentifier("race-detail-ready-\(race.id)")
                            .allowsHitTesting(false)
                    }
                    #endif

                    RaceContextView(
                        section: section,
                        race: race,
                        detail: detail
                    )
                    .padding(.horizontal, 18)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
        .refreshable {
            await viewModel.refresh(policy: .force)
            await refreshSelectedDetailNow()
        }
        .safeAreaInset(edge: .bottom) {
            tutorial
        }
    }

    @ViewBuilder
    private func raceCard(_ race: Race) -> some View {
        let detail = detailForCard(race)
        let isSelected = race.id == selectedRace?.id

        switch section {
        case .upcoming:
            UpcomingRaceCard(
                race: race,
                detail: detail,
                isSelected: isSelected,
                isAuthenticated: authManager.isAuthenticated,
                onSchedule: { openSchedule(race) },
                onSelectSlot: { slot in openPicker(slot, for: race) },
                onRetryCommit: {
                    guard let detail else {
                        return .rejected("Race picks are not ready yet.")
                    }
                    return retryCurrentSelectionCommit(detail: detail)
                },
                onSignIn: { isShowingSignIn = true },
                onResolveConflict: { resolvePickConflict(for: race) }
            )
        case .past:
            PastRaceCard(
                race: race,
                detail: detail,
                isSelected: isSelected,
                onSchedule: { openSchedule(race) }
            )
        }
    }

    private func detailForCard(_ race: Race) -> RaceDetailViewModel? {
        if scopedSelectedDetail?.race.id == race.id { return scopedSelectedDetail }
        return viewModel.existingDetailViewModel(
            for: race.id,
            privateScopeID: privateScopeID
        )
    }

    @ViewBuilder
    private var tutorial: some View {
        if section == .upcoming,
           !tutorialStore.hasSeenPickTutorial,
           !authManager.isAuthenticated,
           selectedRace?.status != .completed,
           scopedSelectedDetail?.isPickLocked != true {
            TutorialCard(
                icon: "hand.tap.fill",
                title: "Make three picks",
                message: "Choose P1, P10, and one driver who won't be classified. The picker moves through all three without closing."
            ) {
                if reduceMotion {
                    tutorialStore.hasSeenPickTutorial = true
                } else {
                    withAnimation(.spring(duration: 0.3)) {
                        tutorialStore.hasSeenPickTutorial = true
                    }
                }
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading races…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var emptyState: some View {
        ContentUnavailableView(
            section == .upcoming ? "No upcoming races" : "No past races",
            systemImage: section == .upcoming ? "calendar.badge.clock" : "flag.checkered",
            description: Text(
                section == .upcoming
                    ? "The next race will appear here when the calendar updates."
                    : "Completed races will appear here."
            )
        )
    }

    @MainActor
    private func loadSelectedDetail() async {
        let selectionSpanToken = raceSelectionReadySpan.flatMap { span in
            span.raceID == selectedRaceID ? span.token : nil
        }
        defer { abandonRaceSelection(token: selectionSpanToken) }
        guard let race = selectedRace,
              let detail = viewModel.detailViewModel(
                for: race,
                privateScopeID: privateScopeID
              )
        else {
            foregroundRefreshTask?.cancel()
            foregroundRefreshTask = nil
            selectedDetail?.cancelLoad()
            selectedDetail = nil
            selectedDetailScopeID = nil
            return
        }

        let detailReadyInterval = FXPerformance.begin(.selectedRaceDetailReady)
        defer { detailReadyInterval.end() }
        foregroundRefreshTask?.cancel()
        foregroundRefreshTask = nil
        if let currentDetail = selectedDetail, currentDetail !== detail {
            currentDetail.cancelLoad()
        }
        selectedDetailScopeID = privateScopeID
        selectedDetail = detail
        await detail.loadIfNeeded(
            token: authManager.accessToken,
            userID: authManager.authenticatedUser?.id,
            localPickStore: localPickStore
        )
        guard !Task.isCancelled,
              selectedRaceID == race.id,
              detail === scopedSelectedDetail,
              !detail.entrants.isEmpty
        else { return }
        finishRaceSelection(token: selectionSpanToken)
    }

    private func beginRaceSelection(to raceID: String?) {
        guard let previousRaceID = selectedRaceID,
              let raceID,
              raceID != previousRaceID
        else { return }

        abandonRaceSelection()
        raceSelectionReadySpan = RaceSelectionPerformanceSpan(
            token: UUID(),
            raceID: raceID,
            interval: FXPerformance.begin(.raceSelectionReady)
        )
    }

    private func finishRaceSelection(token: UUID?) {
        guard let token,
              raceSelectionReadySpan?.token == token,
              let span = raceSelectionReadySpan
        else { return }
        span.interval.end()
        raceSelectionReadySpan = nil
    }

    private func abandonRaceSelection(token: UUID? = nil) {
        guard let span = raceSelectionReadySpan,
              token == nil || span.token == token
        else { return }
        span.interval.abandon()
        raceSelectionReadySpan = nil
    }

    private func refreshSelectedDetail() {
        foregroundRefreshTask?.cancel()
        foregroundRefreshTask = nil
        guard let detail = scopedSelectedDetail,
              detail.race.id == selectedRaceID
        else { return }

        let raceID = detail.race.id
        foregroundRefreshTask = Task { @MainActor in
            guard !Task.isCancelled,
                  raceID == selectedRaceID,
                  detail === scopedSelectedDetail
            else { return }
            await detail.refresh(
                token: authManager.accessToken,
                userID: authManager.authenticatedUser?.id,
                localPickStore: localPickStore
            )
        }
    }

    @MainActor
    private func refreshSelectedDetailNow() async {
        guard let selectedDetail = scopedSelectedDetail,
              selectedDetail.race.id == selectedRaceID
        else { return }
        await selectedDetail.refresh(
            token: authManager.accessToken,
            userID: authManager.authenticatedUser?.id,
            localPickStore: localPickStore
        )
    }

    private func reconcileSelectedDetail() {
        scopedSelectedDetail?.reconcileLocalState(
            token: authManager.accessToken,
            userID: authManager.authenticatedUser?.id,
            localPickStore: localPickStore
        )
    }

    private func openPicker(_ slot: PickSlot, for race: Race) {
        guard race.id == selectedRace?.id,
              let detail = scopedSelectedDetail,
              detail.race.id == race.id
        else { return }
        guard !detail.isPickLocked else {
            Haptics.locked()
            return
        }
        guard !detail.entrants.isEmpty else { return }

        let pickerPreparationInterval = FXPerformance.begin(.driverPickerPreparation)
        defer { pickerPreparationInterval.end() }
        let selectedDriverIDs: [PickSlot: String] = [
                .winner: detail.selectedWinnerID,
                .p10: detail.selectedP10ID,
                .dnf: detail.selectedDNFID,
            ].compactMapValues { $0 }
        pickerState = DriverPickerState(
            activeSlot: DriverPickerState.startingSlot(
                requested: slot,
                selectedDriverIDs: selectedDriverIDs
            ),
            selectedDriverIDs: selectedDriverIDs,
            isLocked: detail.isPickLocked
        )
        pickerPresentationInterval?.end()
        pickerPresentationInterval = FXPerformance.begin(.driverPickerPresentation)
        isShowingPicker = true
    }

    private func finishPickerPresentation() {
        pickerPresentationInterval?.end()
        pickerPresentationInterval = nil
    }

    private func openSchedule(_ race: Race) {
        schedulePresentationInterval?.end()
        schedulePresentationInterval = FXPerformance.begin(.schedulePresentation)
        scheduledRace = race
    }

    private func finishSchedulePresentation() {
        schedulePresentationInterval?.end()
        schedulePresentationInterval = nil
    }

    private func commitSelection(
        _ driver: Driver,
        for slot: PickSlot,
        detail: RaceDetailViewModel
    ) -> PickSelectionOutcome {
        var selectedDriverIDs: [PickSlot: String] = [
            .winner: detail.selectedWinnerID,
            .p10: detail.selectedP10ID,
            .dnf: detail.selectedDNFID,
        ].compactMapValues { $0 }
        selectedDriverIDs[slot] = driver.id
        let isFinalSelection = selectedDriverIDs.count == PickSlot.allCases.count
        let outcome = PickCommitMeasurement.perform(
            shouldMeasure: isFinalSelection,
            begin: { FXPerformance.begin(.saveCompletion) },
            end: { $0.end() },
            operation: {
                detail.selectAndCommit(
                    driver: driver,
                    for: slot,
                    token: authManager.accessToken,
                    userID: authManager.authenticatedUser?.id,
                    localPickStore: localPickStore
                )
            }
        )
        return finishLocalCommit(outcome, detail: detail)
    }

    private func retryCurrentSelectionCommit(
        detail: RaceDetailViewModel
    ) -> PickSelectionOutcome {
        let outcome = PickCommitMeasurement.perform(
            shouldMeasure: true,
            begin: { FXPerformance.begin(.saveCompletion) },
            end: { $0.end() },
            operation: {
                detail.retryCurrentSelectionCommit(
                    token: authManager.accessToken,
                    userID: authManager.authenticatedUser?.id,
                    localPickStore: localPickStore
                )
            }
        )
        return finishLocalCommit(outcome, detail: detail)
    }

    private func finishLocalCommit(
        _ outcome: PickSelectionOutcome,
        detail: RaceDetailViewModel
    ) -> PickSelectionOutcome {
        guard case .committed(let ticket) = outcome else { return outcome }
        Task {
            await detail.syncCommittedPick(
                ticket,
                token: authManager.accessToken,
                userID: authManager.authenticatedUser?.id,
                localPickStore: localPickStore
            )
        }
        return outcome
    }

    @ViewBuilder
    private func legacyRecoverySheet(
        _ presentation: LegacyRecoveryPresentation
    ) -> some View {
        if let detail = scopedSelectedDetail,
           detail.race.id == presentation.raceID,
           presentation.privateScopeID == privateScopeID {
            LegacyPickRecoverySheet(
                presentation: presentation,
                authority: detail.privatePickAuthority,
                isLocked: detail.isPickLocked,
                errorMessage: legacyRecoveryErrorMessage,
                onAction: { action in
                    handleLegacyRecoveryAction(
                        action,
                        presentation: presentation,
                        detail: detail
                    )
                }
            )
        }
    }

    @discardableResult
    private func presentLegacyRecoveryIfNeeded() -> Bool {
        guard section == .upcoming,
              let race = selectedRace,
              let detail = scopedSelectedDetail,
              detail.race.id == race.id,
              !detail.entrants.isEmpty,
              let legacy = localPickStore.legacyConflict(for: race.id)
        else { return false }

        let refreshedPresentation = legacyRecoveryPresentation(
            race: race,
            detail: detail,
            legacy: legacy
        )
        if let activePresentation = legacyRecoveryPresentation {
            legacyRecoveryPresentation = activePresentation.refreshed(
                userID: refreshedPresentation.userID,
                isSignedIn: refreshedPresentation.isSignedIn,
                requiresConnection: refreshedPresentation.requiresConnection,
                destinationRevision: refreshedPresentation.destinationRevision,
                serverPick: refreshedPresentation.serverPick,
                found: refreshedPresentation.found,
                current: refreshedPresentation.current
            )
            return true
        }
        guard legacyRecoveryPresentationSession.claim(
            raceID: race.id,
            privateScopeID: privateScopeID
        ) else { return false }

        legacyRecoveryErrorMessage = nil
        legacyRecoveryPresentation = refreshedPresentation
        return true
    }

    private func legacyRecoveryPresentation(
        race: Race,
        detail: RaceDetailViewModel,
        legacy: LocalPickRecord
    ) -> LegacyRecoveryPresentation {
        let context = legacyRecoveryAccountContext
        let owner: PickOwnerScope = context.userID.map(PickOwnerScope.user) ?? .guest
        let destination = localPickStore.record(for: race.id, owner: owner)
        let currentSelection = destination?.selection
            ?? serverSelection(detail.serverPick, userID: context.userID)
        return LegacyRecoveryPresentation(
            raceID: race.id,
            privateScopeID: privateScopeID,
            userID: context.userID,
            isSignedIn: context.isSignedIn,
            requiresConnection: context.requiresConnection,
            legacyRevision: legacy.revision,
            destinationRevision: destination?.revision,
            serverPick: privatePickSnapshot(detail.serverPick),
            found: triplet(legacy.selection, entrants: detail.entrants),
            current: currentSelection.map {
                triplet($0, entrants: detail.entrants)
            }
        )
    }

    private func resolvePickConflict(for race: Race) {
        if presentLegacyRecoveryIfNeeded() { return }
        openPicker(.winner, for: race)
    }

    private func handleLegacyRecoveryAction(
        _ action: LegacyRecoverySheetAction,
        presentation: LegacyRecoveryPresentation,
        detail: RaceDetailViewModel
    ) {
        guard legacyRecoveryPresentation?.id == presentation.id,
              presentation.privateScopeID == privateScopeID,
              presentation.userID == authManager.authenticatedUser?.id
        else {
            dismissLegacyRecovery()
            return
        }

        switch action {
        case .notNow:
            dismissLegacyRecovery()
        case .retry:
            legacyRecoveryErrorMessage = nil
            Task {
                if presentation.requiresConnection {
                    await authManager.retrySession(races: viewModel.races)
                }
                await detail.refresh(
                    token: authManager.accessToken,
                    userID: authManager.authenticatedUser?.id,
                    localPickStore: localPickStore
                )
            }
        case .use, .discard, .keepCurrent, .replace:
            guard let owner = presentation.mutationOwner else {
                legacyRecoveryErrorMessage = "Connect to check account picks, then retry."
                return
            }
            let recoveryAction: LegacyRecoveryAction = switch action {
            case .use: .use
            case .discard: .discard
            case .keepCurrent: .keepCurrent
            case .replace: .replace
            case .retry, .notNow: preconditionFailure("Handled above")
            }
            let token = authManager.accessToken
            let userID = authManager.authenticatedUser?.id
            let outcome = detail.resolveLegacyDevicePick(
                action: recoveryAction,
                expectedOwner: owner,
                expectedLegacyRevision: presentation.legacyRevision,
                expectedDestinationRevision: presentation.destinationRevision,
                expectedServerPick: presentation.serverPick,
                token: token,
                userID: userID,
                localPickStore: localPickStore
            )
            switch outcome {
            case .resolved:
                dismissLegacyRecovery()
            case .committed(let ticket):
                dismissLegacyRecovery()
                Task {
                    await detail.syncCommittedPick(
                        ticket,
                        token: token,
                        userID: userID,
                        localPickStore: localPickStore
                    )
                }
            case .rejected(let message):
                legacyRecoveryErrorMessage = message
            }
        }
    }

    private func dismissLegacyRecovery() {
        legacyRecoveryPresentation = nil
        legacyRecoveryErrorMessage = nil
    }

    private func serverSelection(_ pick: Pick?, userID: String?) -> PickSelection? {
        guard userID != nil, let pick else { return nil }
        return PickSelection(
            winnerDriverID: pick.winnerDriverId,
            tenthPlaceDriverID: pick.tenthPlaceDriverId,
            dnfDriverID: pick.dnfDriverId
        )
    }

    private func privatePickSnapshot(
        _ pick: Pick?
    ) -> LegacyPrivatePickSnapshot? {
        pick.map {
            LegacyPrivatePickSnapshot(
                id: $0.id,
                selection: PickSelection(
                    winnerDriverID: $0.winnerDriverId,
                    tenthPlaceDriverID: $0.tenthPlaceDriverId,
                    dnfDriverID: $0.dnfDriverId
                ),
                lockedAt: $0.lockedAt,
                updatedAt: $0.updatedAt
            )
        }
    }

    private func triplet(
        _ selection: PickSelection,
        entrants: [Driver]
    ) -> LegacyPickTriplet {
        LegacyPickTriplet(
            winner: driverName(selection.winnerDriverID, entrants: entrants),
            tenthPlace: driverName(
                selection.tenthPlaceDriverID,
                entrants: entrants
            ),
            dnf: driverName(selection.dnfDriverID, entrants: entrants)
        )
    }

    private func driverName(_ id: String, entrants: [Driver]) -> String {
        guard let driver = entrants.first(where: { $0.id == id }) else {
            return "Unknown driver"
        }
        return "\(driver.firstName) \(driver.lastName)"
    }

    @MainActor
    private func monitorPickerLock() async {
        guard isShowingPicker else { return }

        while !Task.isCancelled, isShowingPicker {
            guard let selectedDetail = scopedSelectedDetail else { return }
            if selectedDetail.isPickLocked {
                pickerState.isLocked = true
                isShowingPicker = false
                AccessibilityNotification.Announcement(
                    "Picks are now locked. The driver picker has closed."
                ).post()
                return
            }
            try? await Task.sleep(for: .seconds(1))
        }
    }

}
