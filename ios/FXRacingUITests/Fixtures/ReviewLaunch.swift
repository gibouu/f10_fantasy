import XCTest

extension XCTestCase {
    @MainActor
    func launch(
        _ scenario: PerformanceScenario,
        extraArguments: [String] = []
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--performance-scenario", scenario.rawValue,
        ] + extraArguments
        app.launch()
        if !app.wait(for: .runningForeground, timeout: 2) {
            app.activate()
        }
        return app
    }
}
