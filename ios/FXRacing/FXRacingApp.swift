import SwiftUI

@main
struct FXRacingApp: App {
    @Environment(\.scenePhase) private var scenePhase
    private let raceDetailViewModelFactory: RaceDetailViewModelFactory
    @State private var authManager: AuthManager
    @State private var localPickStore = LocalPickStore()
    @State private var guestStore     = GuestStore()
    @State private var tutorialStore  = TutorialStore()

    @MainActor
    init() {
        let api = APIClient()
        let clock = SystemClock()
        let repository = RaceRepository(
            api: api,
            cache: RaceSnapshotCache(),
            clock: clock
        )
        let syncManager = SyncManager(api: api, clock: clock)
        raceDetailViewModelFactory = RaceDetailViewModelFactory(
            repository: repository,
            api: api,
            syncManager: syncManager,
            clock: clock
        )
        _authManager = State(
            initialValue: AuthManager(api: api, syncManager: syncManager)
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView(raceDetailViewModelFactory: raceDetailViewModelFactory)
                .environment(authManager)
                .environment(localPickStore)
                .environment(guestStore)
                .environment(tutorialStore)
                .task {
                    // Wire stores before restoring session so migration has access to them
                    authManager.localPickStore = localPickStore
                    authManager.guestStore     = guestStore
                    await authManager.restoreSession()
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task { await authManager.handleForeground() }
                }
        }
    }
}
