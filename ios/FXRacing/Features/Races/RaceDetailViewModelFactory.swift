import Foundation

struct RaceDetailViewModelFactory: Sendable {
    let repository: any RaceRepositoryProtocol
    let api: any APIRequesting
    let syncManager: SyncManager
    let clock: any ClockProviding

    @MainActor
    func make(summary: Race) -> RaceDetailViewModel {
        RaceDetailViewModel(
            summary: summary,
            repository: repository,
            api: api,
            syncManager: syncManager,
            clock: clock
        )
    }
}
