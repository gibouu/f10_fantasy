import XCTest

extension XCTestCase {
    @MainActor
    func launch(_ scenario: PerformanceScenario) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--performance-scenario", scenario.rawValue]
        app.launch()
        if !app.wait(for: .runningForeground, timeout: 2) {
            app.activate()
        }
        return app
    }
}
