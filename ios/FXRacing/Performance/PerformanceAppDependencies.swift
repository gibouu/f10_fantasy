#if FX_PERF_HARNESS
import Foundation

@MainActor
struct PerformanceAppDependencies {
    let api: any APIRequesting
    let authManager: AuthManager
    let imagePipeline: FXImagePipeline
    let raceDeckViewModel: RaceDeckViewModel
    let raceDetailViewModelFactory: RaceDetailViewModelFactory

    static func fromProcessArguments(
        _ arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> PerformanceAppDependencies? {
        guard let flagIndex = arguments.firstIndex(of: "--performance-scenario"),
              arguments.indices.contains(flagIndex + 1),
              let scenario = PerformanceFixtureScenario(rawValue: arguments[flagIndex + 1])
        else { return nil }

        return PerformanceAppDependencies(scenario: scenario)
    }

    private init(scenario: PerformanceFixtureScenario) {
        DeterministicFailureURLProtocol.install()

        let api = PerformanceAPIClient(scenario: scenario)
        let clock = PerformanceClock(
            date: scenario == .offline
                ? PerformanceFixtures.now.addingTimeInterval(3_600)
                : PerformanceFixtures.now
        )
        let repository: any RaceRepositoryProtocol = switch scenario {
        case .cachePrime, .cachedLaunch, .offline:
            RaceRepository(
                api: api,
                cache: RaceSnapshotCache(),
                clock: clock
            )
        case .authChecking, .accountUnavailable, .empty, .cached, .image, .gameplay:
            PerformanceRaceRepository(scenario: scenario)
        }
        let syncManager = SyncManager(api: api, clock: clock)
        let token: String? = switch scenario {
        case .authChecking, .accountUnavailable:
            "fixture-token"
        case .gameplay:
            "fixture-gameplay-token"
        case .empty, .cached, .cachePrime, .cachedLaunch, .offline, .image:
            nil
        }

        self.api = api
        imagePipeline = FXImagePipeline(loader: PerformanceImageDataLoader())
        authManager = AuthManager(
            api: api,
            tokenStore: PerformanceTokenStore(token: token),
            syncManager: syncManager
        )
        raceDetailViewModelFactory = RaceDetailViewModelFactory(
            repository: repository,
            api: api,
            syncManager: syncManager,
            clock: clock
        )
        raceDeckViewModel = RaceDeckViewModel(
            repository: repository,
            clock: clock,
            detailViewModelFactory: raceDetailViewModelFactory
        )
    }
}
#endif
