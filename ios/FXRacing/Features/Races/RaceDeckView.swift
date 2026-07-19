import SwiftUI

private struct RaceSelectionPerformanceSpan {
    let token: UUID
    let raceID: String
    let interval: FXPerformanceSpan
}

struct RaceDeckView: View {
    @Bindable var viewModel: RaceDeckViewModel
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
        .task(id: detailTaskKey) {
            await loadSelectedDetail()
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
                    RaceContextView(
                        section: section,
                        race: race,
                        detail: detail
                    )
                    .padding(.horizontal, 18)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))

                    #if FX_PERF_HARNESS
                    if !detail.entrants.isEmpty {
                        Color.clear
                            .frame(width: 1, height: 1)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("Race details ready")
                            .accessibilityIdentifier("race-detail-ready-\(race.id)")
                            .allowsHitTesting(false)
                    }
                    #endif
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
                onSignIn: { isShowingSignIn = true }
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
                message: "Choose P1, P10, and the first DNF. The picker moves through all three without closing."
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
        let saveCompletionInterval = isFinalSelection
            ? FXPerformance.begin(.saveCompletion)
            : nil

        let outcome = detail.selectAndCommit(
            driver: driver,
            for: slot,
            token: authManager.accessToken,
            userID: authManager.authenticatedUser?.id,
            localPickStore: localPickStore
        )

        guard case .committed(let ticket) = outcome else {
            saveCompletionInterval?.abandon()
            return outcome
        }
        saveCompletionInterval?.end()
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
