import XCTest
@testable import FXRacing

final class DriverPickerStateTests: XCTestCase {
    func testEmptyDraftAlwaysStartsAtWinnerEvenWhenAnotherSlotWasTapped() {
        XCTAssertEqual(
            DriverPickerState.startingSlot(
                requested: .dnf,
                selectedDriverIDs: [:]
            ),
            .winner
        )
        XCTAssertEqual(
            DriverPickerState.startingSlot(
                requested: .p10,
                selectedDriverIDs: [.winner: DriverFixtures.norris.id]
            ),
            .p10
        )
    }

    func testPickSlotsAdvanceInGameplayOrder() {
        XCTAssertEqual(PickSlot.winner.next, .p10)
        XCTAssertEqual(PickSlot.p10.next, .dnf)
        XCTAssertNil(PickSlot.dnf.next)
    }

    func testSelectionAdvancesWithoutDismissing() {
        var state = DriverPickerState(
            activeSlot: .winner,
            selectedDriverIDs: [:],
            isLocked: false
        )

        XCTAssertTrue(state.select(DriverFixtures.norris))

        XCTAssertEqual(state.selectedDriverIDs[.winner], DriverFixtures.norris.id)
        XCTAssertEqual(state.activeSlot, .p10)
        XCTAssertTrue(state.isPresented)
    }

    func testSelectingAllThreeDriversKeepsSheetPresented() {
        var state = DriverPickerState(
            activeSlot: .winner,
            selectedDriverIDs: [:],
            isLocked: false
        )

        XCTAssertTrue(state.select(DriverFixtures.norris))
        XCTAssertTrue(state.select(DriverFixtures.piastri))
        XCTAssertTrue(state.select(DriverFixtures.leclerc))

        XCTAssertEqual(
            state.selectedDriverIDs,
            [
                .winner: DriverFixtures.norris.id,
                .p10: DriverFixtures.piastri.id,
                .dnf: DriverFixtures.leclerc.id,
            ]
        )
        XCTAssertEqual(state.activeSlot, .dnf)
        XCTAssertTrue(state.isPresented)
    }

    func testDriverSelectedInAnotherSlotIsUnavailableWithReason() {
        let state = DriverPickerState(
            activeSlot: .p10,
            selectedDriverIDs: [.winner: DriverFixtures.norris.id],
            isLocked: false
        )

        XCTAssertFalse(state.isAvailable(DriverFixtures.norris))
        XCTAssertEqual(
            state.unavailabilityReason(for: DriverFixtures.norris),
            "Already selected for P1."
        )
        XCTAssertTrue(state.isAvailable(DriverFixtures.piastri))
        XCTAssertNil(state.unavailabilityReason(for: DriverFixtures.piastri))
    }

    func testEditingAnExistingSlotAllowsItsDriverAndReplacesIt() {
        var state = DriverPickerState(
            activeSlot: .p10,
            selectedDriverIDs: [
                .winner: DriverFixtures.norris.id,
                .p10: DriverFixtures.piastri.id,
            ],
            isLocked: false
        )

        XCTAssertTrue(state.isAvailable(DriverFixtures.piastri))
        XCTAssertTrue(state.select(DriverFixtures.leclerc))
        XCTAssertEqual(state.selectedDriverIDs[.p10], DriverFixtures.leclerc.id)
        XCTAssertTrue(state.isAvailable(DriverFixtures.piastri))
        XCTAssertEqual(state.activeSlot, .dnf)
    }

    func testLockedStateRefusesSelectionWithoutChangingDraft() {
        var state = DriverPickerState(
            activeSlot: .winner,
            selectedDriverIDs: [:],
            isLocked: true
        )

        XCTAssertFalse(state.select(DriverFixtures.norris))
        XCTAssertTrue(state.selectedDriverIDs.isEmpty)
        XCTAssertEqual(state.activeSlot, .winner)
        XCTAssertEqual(
            state.unavailabilityReason(for: DriverFixtures.norris),
            "Picks are locked."
        )
    }

    func testSelectionIsRefusedWhenLockCrossesWhilePickerIsOpen() {
        var state = DriverPickerState(
            activeSlot: .winner,
            selectedDriverIDs: [:],
            isLocked: false
        )
        state.isLocked = true

        XCTAssertFalse(state.select(DriverFixtures.norris))
        XCTAssertTrue(state.selectedDriverIDs.isEmpty)
        XCTAssertEqual(state.activeSlot, .winner)
        XCTAssertTrue(state.isPresented)
    }
}
