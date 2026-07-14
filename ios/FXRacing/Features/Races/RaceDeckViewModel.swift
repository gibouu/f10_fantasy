import Foundation
import Observation

enum RaceDeckSection: Equatable, Sendable {
    case upcoming
    case past
}

@Observable
@MainActor
final class RaceDeckViewModel {
    private(set) var races: [Race] = []
    private(set) var season: Season?
    private(set) var isLoading = false
    private(set) var isRefreshing = false
    private(set) var errorMessage: String?
    private(set) var staleErrorMessage: String?
    private(set) var transitionedRaceID: String?
    private(set) var activeSection: RaceDeckSection? = .upcoming

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

    @ObservationIgnored private let repository: any RaceRepositoryProtocol
    @ObservationIgnored private let clock: any ClockProviding
    @ObservationIgnored private let detailViewModelFactory: RaceDetailViewModelFactory?
    @ObservationIgnored private var detailViewModels: [String: RaceDetailViewModel] = [:]
    @ObservationIgnored private var prefetchTask: Task<Void, Never>?
    @ObservationIgnored private var initialStartTask: Task<Void, Never>?
    @ObservationIgnored private var hasCompletedInitialStart = false
    @ObservationIgnored private var generation: UInt64 = 0
    @ObservationIgnored private var lastLivePollAt: Date?

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
        let cached = await repository.cachedList()
        guard currentGeneration == generation else { return }

        if let cached {
            publish(cached)
            isLoading = false
        }

        await performRefresh(policy: .ifStale, generation: currentGeneration)
    }

    func refresh(policy: RaceFetchPolicy) async {
        let currentGeneration = beginRefresh()
        await performRefresh(policy: policy, generation: currentGeneration)
    }

    /// Called by a view-owned 60-second lifecycle task. Keeping the cadence
    /// outside this model makes polling deterministic in tests and cancellable
    /// with the view hierarchy.
    func pollLiveRaces() async {
        guard hasLiveRace else { return }
        let now = clock.now()
        if let lastLivePollAt,
           now.timeIntervalSince(lastLivePollAt) < 60 {
            return
        }
        lastLivePollAt = now
        await refresh(policy: .foreground)
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

    func detailViewModel(for race: Race) -> RaceDetailViewModel? {
        if let existing = detailViewModels[race.id] {
            return existing
        }
        guard let detailViewModelFactory else { return nil }

        let summary = races.first(where: { $0.id == race.id }) ?? race
        let viewModel = detailViewModelFactory.make(summary: summary)
        detailViewModels[race.id] = viewModel
        return viewModel
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
            detailViewModels[race.id]?.updateSummary(race)
        }
        if !hasLiveRace {
            lastLivePollAt = nil
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
