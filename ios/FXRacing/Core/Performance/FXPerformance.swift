import os

enum FXPerformanceInterval: String, Sendable {
    case launchToShell = "LaunchToShell"
    case launchDependencyAssembly = "LaunchDependencyAssembly"
    case sectionSwitch = "SectionSwitch"
    case raceSelectionReady = "RaceSelectionReady"
    case selectedRaceDetailReady = "SelectedRaceDetailReady"
    case driverPickerPreparation = "DriverPickerPreparation"
    case driverPickerPresentation = "DriverPickerPresentation"
    case saveCompletion = "SaveCompletion"
    case serverAcknowledgement = "ServerAcknowledgement"
    case cachedListPublication = "CachedListPublication"
    case schedulePresentation = "SchedulePresentation"

    fileprivate var signpostName: StaticString {
        switch self {
        case .launchToShell: "LaunchToShell"
        case .launchDependencyAssembly: "LaunchDependencyAssembly"
        case .sectionSwitch: "SectionSwitch"
        case .raceSelectionReady: "RaceSelectionReady"
        case .selectedRaceDetailReady: "SelectedRaceDetailReady"
        case .driverPickerPreparation: "DriverPickerPreparation"
        case .driverPickerPresentation: "DriverPickerPresentation"
        case .saveCompletion: "SaveCompletion"
        case .serverAcknowledgement: "ServerAcknowledgement"
        case .cachedListPublication: "CachedListPublication"
        case .schedulePresentation: "SchedulePresentation"
        }
    }
}

@MainActor
final class FXPerformanceSpan {
    private let interval: FXPerformanceInterval
    private let state: OSSignpostIntervalState
    private var hasEnded = false

    fileprivate init(interval: FXPerformanceInterval) {
        self.interval = interval
        state = FXPerformance.signposter.beginInterval(interval.signpostName)
    }

    func end() {
        guard !hasEnded else { return }
        hasEnded = true
        FXPerformance.signposter.endInterval(interval.signpostName, state)
    }

    func abandon() {
        guard !hasEnded else { return }
        hasEnded = true
    }
}

enum FXPerformance {
    fileprivate static let signposter = OSSignposter(
        subsystem: "com.fxracing.app",
        category: .pointsOfInterest
    )

    @MainActor
    static func begin(_ interval: FXPerformanceInterval) -> FXPerformanceSpan {
        FXPerformanceSpan(interval: interval)
    }
}
