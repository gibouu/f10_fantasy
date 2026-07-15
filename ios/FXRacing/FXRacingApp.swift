import SwiftUI

@main
struct FXRacingApp: App {
    @Environment(\.scenePhase) private var scenePhase
    private let imagePipeline: FXImagePipeline
    private let leaderboardAPI: any APIRequesting
    private let raceDetailViewModelFactory: RaceDetailViewModelFactory
    private let launchToShellInterval: FXPerformanceSpan
    @State private var raceDeckViewModel: RaceDeckViewModel
    @State private var authManager: AuthManager
    #if FX_PERF_HARNESS
    @State private var localPickStore = PerformanceFixtureState.makeLocalPickStore()
    #else
    @State private var localPickStore = LocalPickStore()
    #endif
    @State private var guestStore     = GuestStore()
    #if FX_PERF_HARNESS
    @State private var tutorialStore = PerformanceFixtureState.makeTutorialStore()
    #else
    @State private var tutorialStore  = TutorialStore()
    #endif

    @MainActor
    init() {
        launchToShellInterval = FXPerformance.begin(.launchToShell)
        let dependencyAssemblyInterval = FXPerformance.begin(.launchDependencyAssembly)

        #if FX_PERF_HARNESS
        if let dependencies = PerformanceAppDependencies.fromProcessArguments() {
            imagePipeline = dependencies.imagePipeline
            leaderboardAPI = dependencies.api
            raceDetailViewModelFactory = dependencies.raceDetailViewModelFactory
            _raceDeckViewModel = State(
                initialValue: dependencies.raceDeckViewModel
            )
            _authManager = State(initialValue: dependencies.authManager)
            dependencyAssemblyInterval.end()
            return
        }
        #endif

        imagePipeline = FXImagePipeline()
        let api = APIClient()
        let clock = SystemClock()
        let repository = RaceRepository(
            api: api,
            cache: RaceSnapshotCache(),
            clock: clock
        )
        let syncManager = SyncManager(api: api, clock: clock)
        leaderboardAPI = api
        raceDetailViewModelFactory = RaceDetailViewModelFactory(
            repository: repository,
            api: api,
            syncManager: syncManager,
            clock: clock
        )
        _raceDeckViewModel = State(
            initialValue: RaceDeckViewModel(
                repository: repository,
                clock: clock,
                detailViewModelFactory: raceDetailViewModelFactory
            )
        )
        _authManager = State(
            initialValue: AuthManager(api: api, syncManager: syncManager)
        )
        dependencyAssemblyInterval.end()
    }

    var body: some Scene {
        WindowGroup {
            RootView(
                raceDeckViewModel: raceDeckViewModel,
                leaderboardAPI: leaderboardAPI,
                launchToShellInterval: launchToShellInterval
            )
                .environment(authManager)
                .environment(localPickStore)
                .environment(guestStore)
                .environment(tutorialStore)
                .environment(\.fxImagePipeline, imagePipeline)
                .task {
                    // Wire stores before restoring session so migration has access to them
                    authManager.localPickStore = localPickStore
                    authManager.guestStore     = guestStore
                    await authManager.restoreSession(races: raceDeckViewModel.races)
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task {
                        await raceDeckViewModel.handleForeground()
                    }
                    Task {
                        await authManager.handleForeground(races: raceDeckViewModel.races)
                    }
                }
        }
    }
}
