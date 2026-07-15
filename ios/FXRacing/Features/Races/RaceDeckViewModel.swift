import Foundation
import Observation

enum RaceDeckSection: Equatable, Sendable {
    case upcoming
    case past
}

@Observable
@MainActor
final class RaceDeckViewModel {
    private struct DetailCacheKey: Hashable {
        let raceID: String
        let privateScopeID: String
    }

    private(set) var races: [Race] = []
    private(set) var season: Season?
    private(set) var isLoading = false
    private(set) var isRefreshing = false
    private(set) var errorMessage: String?
    private(set) var staleErrorMessage: String?
    private(set) var transitionedRaceID: String?
    private(set) var activeSection: RaceDeckSection? = .upcoming
    private(set) var liveDetailRefreshRevision: UInt64 = 0

    private var upcomingSelectionID: String?
    private var pastSelectionID: String?

    var selectedUpcomingID: String? {
        get { upcomingSelectionID }
        set {
            let selection = normalizedUpcomingSelection(newValue)
            guard selection != upcomingSelectionID else { return }
            upcomingSelectionID = selection
            if activeSection == .upcoming {
                scheduleActivePrefetch()
            }
        }
    }

    var selectedPastID: String? {
        get { pastSelectionID }
        set {
            let selection = normalizedPastSelection(newValue)
            guard selection != pastSelectionID else { return }
            pastSelectionID = selection
            if activeSection == .past {
                scheduleActivePrefetch()
            }
        }
    }

    var upcoming: [Race] {
        races
            .filter { $0.status == .live || $0.status == .upcoming }
            .sorted(by: ascendingStart)
    }

    var past: [Race] {
        races
            .filter { $0.status == .completed }
            .sorted(by: descendingStart)
    }

    var hasLiveRace: Bool {
        upcoming.contains { $0.status == .live }
    }

    var cachedDetailViewModelCount: Int { detailViewModels.count }

    var imagePrefetchCohortKey: String {
        let sectionKey = switch activeSection {
        case .upcoming: "upcoming"
        case .past: "past"
        case nil: "inactive"
        }
        return ([sectionKey] + activePrefetchIDs).joined(separator: ":")
    }

    @ObservationIgnored private let repository: any RaceRepositoryProtocol
    @ObservationIgnored private let clock: any ClockProviding
    @ObservationIgnored private let detailViewModelFactory: RaceDetailViewModelFactory?
    @ObservationIgnored private var detailViewModels: [DetailCacheKey: RaceDetailViewModel] = [:]
    @ObservationIgnored private var activePrivateScopeID: String?
    @ObservationIgnored private var prefetchTask: Task<Void, Never>?
    @ObservationIgnored private var initialStartTask: Task<Void, Never>?
    @ObservationIgnored private var hasCompletedInitialStart = false
    @ObservationIgnored private var generation: UInt64 = 0
    @ObservationIgnored private var lastStatusPollAt: Date?

    init(
        repository: any RaceRepositoryProtocol,
        clock: any ClockProviding,
        detailViewModelFactory: RaceDetailViewModelFactory? = nil
    ) {
        self.repository = repository
        self.clock = clock
        self.detailViewModelFactory = detailViewModelFactory
    }

    func start() async {
        guard !hasCompletedInitialStart else { return }
        if let initialStartTask {
            await initialStartTask.value
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performInitialStart()
            self.hasCompletedInitialStart = true
            self.initialStartTask = nil
        }
        initialStartTask = task
        await task.value
    }

    func handleForeground() async {
        await start()
        await refresh(policy: .foreground)
    }

    private func performInitialStart() async {
        let currentGeneration = beginRefresh()
        let cachedPublicationInterval = FXPerformance.begin(.cachedListPublication)
        let cached = await repository.cachedList()
        guard currentGeneration == generation else {
            cachedPublicationInterval.end()
            return
        }

        if let cached {
            publish(cached)
            cachedPublicationInterval.end()
            isLoading = false
        } else {
            cachedPublicationInterval.end()
        }

        await performRefresh(policy: .ifStale, generation: currentGeneration)
    }

    func refresh(policy: RaceFetchPolicy) async {
        let currentGeneration = beginRefresh()
        await performRefresh(policy: policy, generation: currentGeneration)
    }

    /// Called by a view-owned 60-second lifecycle task. The list refresh runs
    /// even before a race is live so an app left open can discover the status
    /// transition. A revision tells the visible deck to revalidate its selected
    /// live detail (including the private pick) after the public list refresh.
    func pollLiveRaces() async {
        let now = clock.now()
        if let lastStatusPollAt,
           now.timeIntervalSince(lastStatusPollAt) < 60 {
            return
        }
        lastStatusPollAt = now
        await refresh(policy: .foreground)
        if hasLiveRace {
            liveDetailRefreshRevision &+= 1
        }
    }

    func apply(_ snapshot: RaceListSnapshot) {
        generation &+= 1
        isLoading = false
        isRefreshing = false
        errorMessage = nil
        staleErrorMessage = nil
        publish(snapshot)
    }

    func setActiveSection(_ section: RaceDeckSection?) {
        guard activeSection != section else { return }
        activeSection = section
        scheduleActivePrefetch()
    }

    func clearTransitionedRaceID() {
        transitionedRaceID = nil
    }

    func dismissStaleError() {
        staleErrorMessage = nil
    }

    func detailViewModel(
        for race: Race,
        privateScopeID: String = "device"
    ) -> RaceDetailViewModel? {
        setPrivateScope(privateScopeID)
        let key = DetailCacheKey(
            raceID: race.id,
            privateScopeID: privateScopeID
        )
        if let existing = detailViewModels[key] {
            return existing
        }
        guard let detailViewModelFactory else { return nil }

        let summary = races.first(where: { $0.id == race.id }) ?? race
        let viewModel = detailViewModelFactory.make(summary: summary)
        detailViewModels[key] = viewModel
        return viewModel
    }

    /// Returns a previously visited race detail without creating or loading
    /// anything. Supporting context can use this to stay cache-only.
    func existingDetailViewModel(
        for raceID: String,
        privateScopeID: String = "device"
    ) -> RaceDetailViewModel? {
        guard activePrivateScopeID == nil || activePrivateScopeID == privateScopeID else {
            return nil
        }
        return detailViewModels[
            DetailCacheKey(raceID: raceID, privateScopeID: privateScopeID)
        ]
    }

    /// Produces exact, size-aware requests for entrants in the active race and
    /// its next neighbor. Public detail prefetch completes first so image work
    /// stays bounded to the same two-race scope.
    func activeImagePrefetchRequests(displayScale: CGFloat) async -> [FXImageRequest] {
        let ids = activePrefetchIDs
        let section = activeSection
        guard !ids.isEmpty else { return [] }

        let detailPrefetch = prefetchTask
        await detailPrefetch?.value
        guard !Task.isCancelled,
              ids == activePrefetchIDs,
              section == activeSection
        else { return [] }

        var entrants: [Driver] = []
        for id in ids {
            guard !Task.isCancelled else { return [] }
            if let detail = await repository.cachedDetail(id: id) {
                entrants.append(contentsOf: detail.entrants)
            }
        }
        guard !Task.isCancelled,
              ids == activePrefetchIDs,
              section == activeSection
        else { return [] }

        let scale = max(1, displayScale)
        let photoSize: CGFloat = section == .past ? 30 : 36
        let prefetchesTeamLogos = section == .upcoming
        var seen = Set<FXImageRequest>()
        var requests: [FXImageRequest] = []
        for entrant in entrants {
            if let url = entrant.photoFullURL {
                let request = FXImageRequest(
                    url: url,
                    pixelWidth: max(1, Int(ceil(photoSize * scale))),
                    pixelHeight: max(1, Int(ceil(photoSize * scale))),
                    scale: scale,
                    contentMode: .fill
                )
                if seen.insert(request).inserted { requests.append(request) }
            }
            if prefetchesTeamLogos,
               let url = entrant.constructor.logoFullURL {
                let request = FXImageRequest(
                    url: url,
                    pixelWidth: max(1, Int(ceil(28 * scale))),
                    pixelHeight: max(1, Int(ceil(28 * scale))),
                    scale: scale,
                    contentMode: .fit
                )
                if seen.insert(request).inserted { requests.append(request) }
            }
        }
        return requests
    }

    func setPrivateScope(_ privateScopeID: String) {
        guard activePrivateScopeID != privateScopeID else { return }
        for viewModel in detailViewModels.values {
            viewModel.cancelLoad()
        }
        detailViewModels.removeAll(keepingCapacity: true)
        activePrivateScopeID = privateScopeID
    }

    private func beginRefresh() -> UInt64 {
        generation &+= 1
        errorMessage = nil
        staleErrorMessage = nil
        isRefreshing = true
        isLoading = races.isEmpty
        return generation
    }

    private func performRefresh(
        policy: RaceFetchPolicy,
        generation currentGeneration: UInt64
    ) async {
        defer {
            if currentGeneration == generation {
                isLoading = false
                isRefreshing = false
            }
        }

        do {
            let snapshot = try await repository.refreshList(policy: policy)
            guard currentGeneration == generation else { return }
            publish(snapshot)
            errorMessage = nil
            staleErrorMessage = nil
        } catch {
            guard currentGeneration == generation else { return }
            if races.isEmpty {
                errorMessage = error.localizedDescription
                staleErrorMessage = nil
            } else {
                errorMessage = nil
                staleErrorMessage = error.localizedDescription
            }
        }
    }

    private func publish(_ snapshot: RaceListSnapshot) {
        let previousUpcoming = upcoming
        let previousSelectedUpcomingID = upcomingSelectionID
        let previousPrefetchIDs = activePrefetchIDs

        races = snapshot.races
        season = snapshot.season
        for race in races {
            for (key, viewModel) in detailViewModels where key.raceID == race.id {
                viewModel.updateSummary(race)
            }
        }
        if activeSection == .upcoming,
           let selectedID = previousSelectedUpcomingID,
           let movedRace = previousUpcoming.first(where: { $0.id == selectedID }),
           !upcoming.contains(where: { $0.id == selectedID }),
           past.contains(where: { $0.id == selectedID }) {
            upcomingSelectionID = nextUpcoming(after: movedRace)?.id
                ?? defaultUpcomingSelectionID
            pastSelectionID = selectedID
            transitionedRaceID = selectedID
        } else {
            upcomingSelectionID = normalizedUpcomingSelection(upcomingSelectionID)
            pastSelectionID = normalizedPastSelection(pastSelectionID)
        }

        if activePrefetchIDs != previousPrefetchIDs {
            scheduleActivePrefetch()
        }
    }

    private var defaultUpcomingSelectionID: String? {
        upcoming.first(where: { $0.status == .live })?.id ?? upcoming.first?.id
    }

    private var defaultPastSelectionID: String? { past.first?.id }

    private func normalizedUpcomingSelection(_ proposedID: String?) -> String? {
        guard let proposedID,
              upcoming.contains(where: { $0.id == proposedID })
        else { return defaultUpcomingSelectionID }
        return proposedID
    }

    private func normalizedPastSelection(_ proposedID: String?) -> String? {
        guard let proposedID,
              past.contains(where: { $0.id == proposedID })
        else { return defaultPastSelectionID }
        return proposedID
    }

    private func nextUpcoming(after movedRace: Race) -> Race? {
        upcoming.first {
            if $0.scheduledStartUtc == movedRace.scheduledStartUtc {
                return $0.id > movedRace.id
            }
            return $0.scheduledStartUtc > movedRace.scheduledStartUtc
        }
    }

    private var activePrefetchIDs: [String] {
        let sectionRaces: [Race]
        let selectedID: String?
        switch activeSection {
        case .upcoming:
            sectionRaces = upcoming
            selectedID = upcomingSelectionID
        case .past:
            sectionRaces = past
            selectedID = pastSelectionID
        case nil:
            return []
        }

        guard let selectedID,
              let index = sectionRaces.firstIndex(where: { $0.id == selectedID })
        else { return [] }

        let end = min(index + 2, sectionRaces.endIndex)
        return sectionRaces[index..<end].map(\.id)
    }

    private func scheduleActivePrefetch() {
        prefetchTask?.cancel()
        let ids = activePrefetchIDs

        prefetchTask = Task { [repository] in
            guard !Task.isCancelled else { return }
            await repository.replaceDetailPrefetch(ids: ids)
        }
    }

    private func ascendingStart(_ lhs: Race, _ rhs: Race) -> Bool {
        if lhs.scheduledStartUtc == rhs.scheduledStartUtc {
            return lhs.id < rhs.id
        }
        return lhs.scheduledStartUtc < rhs.scheduledStartUtc
    }

    private func descendingStart(_ lhs: Race, _ rhs: Race) -> Bool {
        if lhs.scheduledStartUtc == rhs.scheduledStartUtc {
            return lhs.id < rhs.id
        }
        return lhs.scheduledStartUtc > rhs.scheduledStartUtc
    }
}
