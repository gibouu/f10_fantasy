import XCTest

final class MainShellUITests: XCTestCase {
    @MainActor
    func testShellIsUsableWhileAuthenticationIsChecking() {
        let app = launch(.authChecking)

        XCTAssertTrue(app.otherElements["main-shell"].waitForExistence(timeout: 1))
        let upcoming = app.buttons["Upcoming"]
        XCTAssertTrue(upcoming.waitForExistence(timeout: 2))
        XCTAssertTrue(upcoming.isHittable)
        XCTAssertEqual(app.tabBars.count, 0)
    }

    @MainActor
    func testAccountUnavailableKeepsGlobalContentAndOffersRetry() {
        let app = launch(.accountUnavailable)

        XCTAssertTrue(element(in: app, identifier: "race-deck").waitForExistence(timeout: 2))
        app.buttons["profile-button"].tap()
        XCTAssertTrue(app.buttons["account-retry"].waitForExistence(timeout: 1))
    }

    @MainActor
    func testRankingsScopeSurvivesSectionRoundTrip() {
        let app = launch(.cached)

        app.buttons["Rankings"].tap()
        app.buttons["Friends"].tap()
        app.buttons["Upcoming"].tap()
        app.buttons["Rankings"].tap()

        XCTAssertTrue(app.buttons["Friends"].isSelected)
    }

    @MainActor
    func testRankingRowOpensAndDismissesPlayerProfileSheet() {
        let app = launch(.gameplay)

        app.buttons["Rankings"].tap()
        let row = app.buttons["ranking-row-fixture-player"]
        XCTAssertTrue(row.waitForExistence(timeout: 2))
        row.tap()

        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 2))
        done.tap()

        XCTAssertFalse(done.waitForExistence(timeout: 2))
        XCTAssertTrue(row.isHittable)
    }

    @MainActor
    func testRaceDeckSwipesToTheNextUpcomingCard() {
        let app = launch(.gameplay)
        let deck = element(in: app, identifier: "race-pager-upcoming")

        XCTAssertTrue(deck.waitForExistence(timeout: 2))
        XCTAssertEqual(deck.value as? String, "Race 1 of 2")
        deck.swipeLeft()

        let settled = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", "Race 2 of 2"),
            object: deck
        )
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 2), .completed)

        let monza = app.otherElements["race-card-monza"]
        XCTAssertTrue(monza.waitForExistence(timeout: 1))
        XCTAssertTrue(monza.isHittable)
    }

    @MainActor
    func testEmptyDraftProgressesP1P10DNFAndSaves() {
        let app = launch(.gameplay)

        let p10Slot = app.buttons["pick-slot-spa-p10"]
        XCTAssertTrue(p10Slot.waitForExistence(timeout: 2))
        if app.state != .runningForeground {
            app.activate()
        }
        revealHittable(p10Slot, in: app)
        XCTAssertTrue(waitUntilHittable(p10Slot))
        p10Slot.tap()

        firstAvailableDriver(in: app).tap()
        XCTAssertTrue(app.navigationBars["Pick P10"].waitForExistence(timeout: 2))
        firstAvailableDriver(in: app).tap()
        XCTAssertTrue(app.navigationBars["Pick DNF"].waitForExistence(timeout: 2))
        firstAvailableDriver(in: app).tap()

        XCTAssertFalse(app.navigationBars["Pick DNF"].waitForExistence(timeout: 2))
        XCTAssertTrue(
            app.staticTexts["Saved on this iPhone"].waitForExistence(timeout: 2)
                || app.staticTexts["Picks saved"].exists
        )
        XCTAssertFalse(app.buttons["save-picks-spa"].exists)
    }

    @MainActor
    func testLegacyRecoveryPresentsOnceAcrossSectionSwitchAndNotNowPreservesIt() {
        let app = launch(.gameplay, extraArguments: ["--legacy-recovery"])

        XCTAssertTrue(
            app.navigationBars["Picks found on this iPhone"]
                .waitForExistence(timeout: 2)
        )
        XCTAssertTrue(app.staticTexts["P1"].exists)
        XCTAssertTrue(app.staticTexts["P10"].exists)
        XCTAssertTrue(app.staticTexts["DNF"].exists)
        app.buttons["Not now"].tap()
        XCTAssertFalse(
            app.navigationBars["Picks found on this iPhone"]
                .waitForExistence(timeout: 1)
        )

        app.buttons["Past"].tap()
        app.buttons["Upcoming"].tap()

        XCTAssertFalse(
            app.navigationBars["Picks found on this iPhone"]
                .waitForExistence(timeout: 1)
        )
    }

    @MainActor
    func testUpcomingSeasonFormAndDriverPickerCoverTheFull2026Field() {
        let app = launch(.gameplay)
        let deck = element(in: app, identifier: "race-deck")
        let seasonForm = element(in: app, identifier: "season-form-spa")

        reveal(seasonForm, bySwipingUp: deck)
        XCTAssertTrue(seasonForm.exists)
        XCTAssertFalse(app.staticTexts["Last race"].exists)

        let antonelliForm = element(in: app, identifier: "season-form-row-antonelli")
        XCTAssertTrue(antonelliForm.exists)
        XCTAssertTrue(antonelliForm.label.contains("average finish"))
        XCTAssertTrue(antonelliForm.label.contains("non-classified results"))

        let p10Slot = app.buttons["pick-slot-spa-p10"]
        reveal(p10Slot, bySwipingDown: deck)
        XCTAssertTrue(waitUntilHittable(p10Slot))
        p10Slot.tap()

        let perez = app.buttons["driver-perez"]
        revealHittable(perez, in: app)
        XCTAssertTrue(perez.isHittable)

        let sainz = app.buttons["driver-sainz"]
        revealHittable(sainz, in: app)
        XCTAssertTrue(sainz.isHittable)
    }

    @MainActor
    func testSeasonFormOpensDriverHistory() {
        let app = launch(.gameplay)
        let deck = element(in: app, identifier: "race-deck")
        let antonelliForm = app.buttons["season-form-row-antonelli"]

        reveal(antonelliForm, bySwipingUp: deck)
        XCTAssertTrue(waitUntilHittable(antonelliForm))
        antonelliForm.tap()

        let sheet = element(in: app, identifier: "driver-form-sheet-antonelli")
        XCTAssertTrue(sheet.waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Kimi Antonelli"].exists)
        XCTAssertTrue(app.staticTexts["Race results before Belgium"].exists)
        XCTAssertTrue(app.staticTexts["British Grand Prix"].exists)

        sheet.swipeDown()
        XCTAssertFalse(sheet.waitForExistence(timeout: 2))
        XCTAssertTrue(antonelliForm.isHittable)
    }

    @MainActor
    func testScheduleUsesASheetAndPastShowsOfficialScoreAndResults() {
        let app = launch(.gameplay)

        let schedule = app.buttons["schedule-spa"]
        XCTAssertTrue(schedule.waitForExistence(timeout: 2))
        schedule.tap()
        let scheduleSheet = element(in: app, identifier: "race-schedule-sheet")
        XCTAssertTrue(scheduleSheet.waitForExistence(timeout: 1))
        scheduleSheet.swipeDown()
        XCTAssertFalse(scheduleSheet.waitForExistence(timeout: 2))

        let past = app.buttons["Past"]
        past.tap()
        XCTAssertTrue(element(in: app, identifier: "race-card-silverstone").waitForExistence(timeout: 2))
        XCTAssertTrue(
            element(in: app, identifier: "race-total-silverstone").waitForExistence(timeout: 2)
        )

        let deck = element(in: app, identifier: "race-deck")
        let results = app.staticTexts["Race results"]
        reveal(results, bySwipingUp: deck)
        XCTAssertTrue(results.exists)

        let pickMarker = app.staticTexts["your-pick-silverstone-antonelli"]
        reveal(pickMarker, bySwipingUp: deck)
        XCTAssertTrue(pickMarker.exists)
        XCTAssertEqual(pickMarker.label, "Your pick")

        let qualifying = app.staticTexts["Qualifying"]
        reveal(qualifying, bySwipingUp: deck)
        XCTAssertTrue(qualifying.exists)
    }

    @MainActor
    private func element(in app: XCUIApplication, identifier: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(identifier: identifier)
            .firstMatch
    }

    @MainActor
    private func reveal(_ element: XCUIElement, bySwipingUp scrollView: XCUIElement) {
        for _ in 0..<4 where !element.isHittable {
            scrollView.swipeUp()
        }
    }

    @MainActor
    private func reveal(_ element: XCUIElement, bySwipingDown scrollView: XCUIElement) {
        for _ in 0..<4 where !element.isHittable {
            scrollView.swipeDown()
        }
    }

    @MainActor
    private func waitUntilHittable(
        _ element: XCUIElement,
        timeout: TimeInterval = 2
    ) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "hittable == true"),
            object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    @MainActor
    private func firstAvailableDriver(in app: XCUIApplication) -> XCUIElement {
        let driver = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH 'driver-' AND enabled == true"
            )
        ).allElementsBoundByIndex.first(where: \.isHittable)
            ?? app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH 'driver-' AND enabled == true")
            ).firstMatch
        XCTAssertTrue(driver.waitForExistence(timeout: 2))
        return driver
    }

    @MainActor
    private func revealHittable(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<12 where !element.isHittable {
            app.swipeUp()
        }
    }
}
