#if FX_PERF_HARNESS
import XCTest

final class FXRacingPerformanceTests: XCTestCase {
    static let warmupCount = 3
    static let sampleCount = 30

    @MainActor
    func testShellPerformance() throws {
        try record("shell") {
            try self.measureLaunch(.cachedLaunch, readyWhen: self.appButton("Upcoming"))
        }

        XCTAssertTrue(primeDiskCache(ifNeededFor: .cachedLaunch))
        let options = XCTMeasureOptions()
        options.iterationCount = resolvedSampleCount
        measure(
            metrics: [
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "LaunchToShell"
                ),
            ],
            options: options
        ) {
            let app = self.configuredApp(.cachedLaunch)
            app.launch()
            XCTAssertTrue(self.waitUntilHittable(app.buttons["Upcoming"]))
            app.terminate()
        }
    }

    @MainActor
    func testCachedLaunchPerformance() throws {
        try record("cached-launch") {
            try self.measureLaunch(.cachedLaunch, readyWhen: self.element("schedule-spa"))
        }

        let options = XCTMeasureOptions()
        XCTAssertTrue(primeDiskCache(ifNeededFor: .cachedLaunch))
        options.iterationCount = resolvedSampleCount
        measure(
            metrics: [
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "LaunchToShell"
                ),
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "CachedListPublication"
                ),
            ],
            options: options
        ) {
            let app = self.configuredApp(.cachedLaunch)
            app.launch()
            XCTAssertTrue(self.waitUntilHittable(self.element("schedule-spa", in: app)))
            app.terminate()
        }
    }

    @MainActor
    func testEmptyLaunchPerformance() throws {
        try record("empty-launch") {
            try self.measureLaunch(.empty, readyWhen: self.element("schedule-spa"))
        }
    }

    @MainActor
    func testOfflineLaunchPerformance() throws {
        try record("offline-launch") {
            try self.measureLaunch(.offline, readyWhen: self.element("schedule-spa"))
        }

        XCTAssertTrue(primeDiskCache(ifNeededFor: .offline))
        let options = XCTMeasureOptions()
        options.iterationCount = resolvedSampleCount
        measure(
            metrics: [
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "LaunchToShell"
                ),
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "CachedListPublication"
                ),
            ],
            options: options
        ) {
            let app = self.configuredApp(.offline)
            app.launch()
            XCTAssertTrue(self.waitUntilHittable(self.element("schedule-spa", in: app)))
            app.terminate()
        }
    }

    @MainActor
    func testImageLaunchPerformance() throws {
        try record("image-launch") {
            let app = try self.launchReadyApp(.image)
            defer { app.terminate() }

            let slot = app.buttons["pick-slot-spa-winner"]
            guard self.waitUntilHittable(slot) else {
                throw HarnessFailure.notReady("P1 slot")
            }
            let start = ContinuousClock.now
            slot.tap()
            guard self.waitUntilHittable(app.buttons["driver-leclerc"]) else {
                throw HarnessFailure.notReady("fixture image driver")
            }
            guard self.waitUntil(condition: {
                self.element("driver-image-leclerc-loaded", in: app).exists
            }) else {
                throw HarnessFailure.notReady("decoded fixture image")
            }
            return self.seconds(start.duration(to: .now))
        }
    }

    @MainActor
    func testRaceSwipePerformance() throws {
        try record("race-swipe") {
            let app = try self.launchReadyApp(.gameplay)
            defer { app.terminate() }

            let pager = self.element("race-pager-upcoming", in: app)
            guard self.waitUntilHittable(pager) else {
                throw HarnessFailure.notReady("Upcoming race pager")
            }
            let detailReady = self.element("race-detail-ready-monza", in: app)
            let start = ContinuousClock.now
            pager.swipeLeft()
            guard self.waitUntil(condition: {
                pager.value as? String == "Race 2 of 2" && detailReady.exists
            }) else {
                throw HarnessFailure.notReady("selected Monza race detail")
            }
            return self.seconds(start.duration(to: .now))
        }

        let options = XCTMeasureOptions()
        options.iterationCount = resolvedSampleCount
        measure(
            metrics: [
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "RaceSelectionReady"
                ),
            ],
            options: options
        ) {
            guard let app = try? self.launchReadyApp(.gameplay) else {
                XCTFail("Gameplay app did not become ready")
                return
            }
            let pager = self.element("race-pager-upcoming", in: app)
            let detailReady = self.element("race-detail-ready-monza", in: app)
            pager.swipeLeft()
            XCTAssertTrue(self.waitUntil {
                pager.value as? String == "Race 2 of 2" && detailReady.exists
            })
            app.terminate()
        }
    }

    @MainActor
    func testDriverSheetPerformance() throws {
        try record("driver-sheet", enforced: false) {
            let app = try self.launchReadyApp(.gameplay)
            defer { app.terminate() }

            let slot = app.buttons["pick-slot-spa-winner"]
            guard self.waitUntilHittable(slot) else {
                throw HarnessFailure.notReady("P1 slot")
            }
            let start = ContinuousClock.now
            slot.tap()
            guard self.waitUntilHittable(app.buttons["driver-leclerc"]) else {
                throw HarnessFailure.notReady("Driver picker")
            }
            return self.seconds(start.duration(to: .now))
        }

        let options = XCTMeasureOptions()
        options.iterationCount = resolvedSampleCount
        measure(
            metrics: [
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "DriverPickerPresentation"
                ),
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "DriverPickerPreparation"
                ),
            ],
            options: options
        ) {
            guard let app = try? self.launchReadyApp(.gameplay) else {
                XCTFail("Gameplay app did not become ready")
                return
            }
            app.buttons["pick-slot-spa-winner"].tap()
            XCTAssertTrue(self.waitUntilHittable(app.buttons["driver-leclerc"]))
            app.terminate()
        }
    }

    @MainActor
    func testScheduleSheetPerformance() throws {
        try record("schedule-sheet", enforced: false) {
            let app = try self.launchReadyApp(.gameplay)
            defer { app.terminate() }

            let schedule = app.buttons["schedule-spa"]
            guard self.waitUntilHittable(schedule) else {
                throw HarnessFailure.notReady("Schedule button")
            }
            let start = ContinuousClock.now
            schedule.tap()
            guard self.waitUntilHittable(self.element("schedule-qualifying", in: app)) else {
                throw HarnessFailure.notReady("Schedule sheet")
            }
            return self.seconds(start.duration(to: .now))
        }

        let options = XCTMeasureOptions()
        options.iterationCount = resolvedSampleCount
        measure(
            metrics: [
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "SchedulePresentation"
                ),
            ],
            options: options
        ) {
            guard let app = try? self.launchReadyApp(.gameplay) else {
                XCTFail("Gameplay app did not become ready")
                return
            }
            app.buttons["schedule-spa"].tap()
            XCTAssertTrue(
                self.waitUntilHittable(self.element("schedule-qualifying", in: app))
            )
            app.terminate()
        }
    }

    @MainActor
    func testLocalSaveDiagnosticPerformance() throws {
        try record("local-save", enforced: false) {
            let app = try self.launchReadyApp(.gameplay)
            defer { app.terminate() }
            try self.prepareThreePicks(in: app)

            let save = app.buttons["save-picks-spa"]
            guard self.waitUntilHittable(save) else {
                throw HarnessFailure.notReady("Save picks")
            }
            let start = ContinuousClock.now
            save.tap()
            guard self.waitUntilHittable(app.buttons["Picks saved"]) else {
                throw HarnessFailure.notReady("Saved state")
            }
            return self.seconds(start.duration(to: .now))
        }
    }

    @MainActor
    func testLocalSavePerformance() {
        let options = XCTMeasureOptions()
        options.iterationCount = resolvedSampleCount
        measure(
            metrics: [
                XCTOSSignpostMetric(
                    subsystem: "com.fxracing.app",
                    category: "PointsOfInterest",
                    name: "SaveCompletion"
                ),
            ],
            options: options
        ) {
            guard let app = try? self.launchReadyApp(.gameplay) else {
                XCTFail("Gameplay app did not become ready")
                return
            }
            do {
                try self.prepareThreePicks(in: app)
            } catch {
                XCTFail(error.localizedDescription)
                app.terminate()
                return
            }
            app.buttons["save-picks-spa"].tap()
            XCTAssertTrue(self.waitUntilHittable(app.buttons["Picks saved"]))
            app.terminate()
        }
    }

    @MainActor
    private func record(
        _ name: String,
        enforced: Bool = false,
        action: () throws -> TimeInterval
    ) throws {
        for _ in 0..<resolvedWarmupCount {
            _ = try action()
        }

        var samples: [Double] = []
        samples.reserveCapacity(resolvedSampleCount)
        for _ in 0..<resolvedSampleCount {
            samples.append(try action())
        }

        let result = try PerformanceResult.record(
            name,
            durations: samples,
            warmups: resolvedWarmupCount,
            enforced: enforced,
            testCase: self
        )
        if enforced {
            XCTAssertTrue(
                result.passed,
                "\(name) p95 \(result.p95)s exceeded \(result.threshold)s"
            )
        }
    }

    @MainActor
    private func measureLaunch(
        _ scenario: PerformanceScenario,
        readyWhen query: (XCUIApplication) -> XCUIElement
    ) throws -> TimeInterval {
        guard primeDiskCache(ifNeededFor: scenario) else {
            throw HarnessFailure.notReady("disk cache prime")
        }
        let app = configuredApp(scenario)
        let start = ContinuousClock.now
        app.launch()
        defer { app.terminate() }
        guard waitUntilHittable(query(app)) else {
            throw HarnessFailure.notReady("\(scenario.rawValue) launch")
        }
        return seconds(start.duration(to: .now))
    }

    @MainActor
    private func launchReadyApp(
        _ scenario: PerformanceScenario
    ) throws -> XCUIApplication {
        guard primeDiskCache(ifNeededFor: scenario) else {
            throw HarnessFailure.notReady("disk cache prime")
        }
        for _ in 0..<2 {
            let app = configuredApp(scenario)
            app.launch()
            if waitUntilHittable(element("schedule-spa", in: app)),
               waitUntilHittable(app.buttons["pick-slot-spa-winner"]) {
                return app
            }
            app.terminate()
        }
        throw HarnessFailure.notReady("interactive gameplay app")
    }

    @MainActor
    private func primeDiskCache(ifNeededFor scenario: PerformanceScenario) -> Bool {
        guard scenario == .cachedLaunch || scenario == .offline else { return true }

        let app = configuredApp(.cachePrime)
        app.launch()
        defer { app.terminate() }
        return waitUntil {
            element("race-detail-ready-spa", in: app).exists
        }
    }

    @MainActor
    private func configuredApp(_ scenario: PerformanceScenario) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--performance-scenario", scenario.rawValue]
        app.launchEnvironment["FX_PERFORMANCE_SAMPLE_ID"] = UUID().uuidString
        return app
    }

    @MainActor
    private func prepareThreePicks(in app: XCUIApplication) throws {
        let slot = app.buttons["pick-slot-spa-winner"]
        guard waitUntilHittable(slot) else {
            throw HarnessFailure.notReady("P1 slot")
        }
        slot.tap()

        for driverID in ["leclerc", "hamilton", "norris"] {
            let driver = app.buttons["driver-\(driverID)"]
            guard waitUntilHittable(driver) else {
                throw HarnessFailure.notReady("Driver \(driverID)")
            }
            driver.tap()
        }

        let done = app.buttons["Done"]
        guard waitUntilHittable(done) else {
            throw HarnessFailure.notReady("Picker Done button")
        }
        done.tap()
    }

    @MainActor
    private func waitUntilHittable(
        _ element: XCUIElement,
        timeout: TimeInterval = 10
    ) -> Bool {
        waitUntil(timeout: timeout) {
            element.exists && element.isHittable && element.isEnabled
        }
    }

    @MainActor
    private func waitUntil(
        timeout: TimeInterval = 10,
        condition: () -> Bool
    ) -> Bool {
        let deadline = ContinuousClock.now.advanced(by: .seconds(timeout))
        repeat {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.01))
        } while ContinuousClock.now < deadline
        return condition()
    }

    @MainActor
    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(identifier: identifier)
            .firstMatch
    }

    @MainActor
    private func element(_ identifier: String) -> (XCUIApplication) -> XCUIElement {
        { app in self.element(identifier, in: app) }
    }

    @MainActor
    private func appButton(_ identifier: String) -> (XCUIApplication) -> XCUIElement {
        { app in app.buttons[identifier] }
    }

    private var resolvedWarmupCount: Int {
        environmentCount("FX_PERFORMANCE_WARMUPS") ?? Self.warmupCount
    }

    private var resolvedSampleCount: Int {
        environmentCount("FX_PERFORMANCE_SAMPLES") ?? Self.sampleCount
    }

    private func environmentCount(_ name: String) -> Int? {
        guard let value = ProcessInfo.processInfo.environment[name],
              let count = Int(value), count >= 0 else { return nil }
        return count
    }

    private func seconds(_ duration: ContinuousClock.Duration) -> Double {
        let components = duration.components
        return Double(components.seconds)
            + (Double(components.attoseconds) / 1_000_000_000_000_000_000)
    }
}

private enum HarnessFailure: LocalizedError {
    case notReady(String)

    var errorDescription: String? {
        switch self {
        case .notReady(let element): "\(element) did not become hittable"
        }
    }
}
#endif
