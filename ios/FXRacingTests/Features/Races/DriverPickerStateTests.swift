import XCTest
@testable import FXRacing

final class DriverPickerStateTests: XCTestCase {
    func testLocalSaveMeasurementBalancesEveryMeasuredOutcome() {
        let ticket = makeTicket()
        let outcomes: [PickSelectionOutcome] = [
            .incomplete,
            .rejected("Disk full"),
            .committed(ticket),
        ]

        for expected in outcomes {
            var beginCount = 0
            var endCount = 0
            let actual = PickCommitMeasurement.perform(
                shouldMeasure: true,
                begin: {
                    beginCount += 1
                    return beginCount
                },
                end: { _ in endCount += 1 },
                operation: { expected }
            )

            XCTAssertEqual(actual, expected)
            XCTAssertEqual(beginCount, 1)
            XCTAssertEqual(endCount, 1)
        }
    }

    func testFeedbackReducerEmitsOnceForLocalCommitAndNeverForBackgroundEvents() {
        let events: [PickCommitFeedbackEvent] = [
            .selection(.committed(makeTicket())),
            .backgroundAcknowledgement,
            .hydration,
        ]

        XCTAssertEqual(
            events.map(PickCommitFeedbackReducer.effect).filter {
                $0 == .localPersistenceSucceeded
            }.count,
            1
        )
        XCTAssertEqual(
            PickCommitFeedbackReducer.effect(for: .selection(.incomplete)),
            .none
        )
        XCTAssertEqual(
            PickCommitFeedbackReducer.effect(
                for: .selection(.rejected("Disk full"))
            ),
            .none
        )
    }

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

    func testIncompleteOutcomeAdvancesAndKeepsSheetPresented() {
        var state = DriverPickerState(
            activeSlot: .winner,
            selectedDriverIDs: [:],
            isLocked: false
        )

        var updatedState = state
        XCTAssertTrue(updatedState.select(DriverFixtures.norris))
        XCTAssertEqual(
            state.apply(updatedState, outcome: .incomplete),
            .advance
        )

        XCTAssertEqual(
            state.selectedDriverIDs,
            [.winner: DriverFixtures.norris.id]
        )
        XCTAssertEqual(state.activeSlot, .p10)
        XCTAssertTrue(state.isPresented)
    }

    func testCommittedOutcomePublishesSelectionAndDismisses() {
        var state = DriverPickerState(
            activeSlot: .dnf,
            selectedDriverIDs: [
                .winner: DriverFixtures.norris.id,
                .p10: DriverFixtures.piastri.id,
            ],
            isLocked: false
        )
        var updatedState = state
        XCTAssertTrue(updatedState.select(DriverFixtures.leclerc))
        let ticket = PickCommitTicket(
            recordID: LocalPickRecordID(owner: .guest, raceID: "spa"),
            revision: 7,
            selection: PickSelection(
                winnerDriverID: DriverFixtures.norris.id,
                tenthPlaceDriverID: DriverFixtures.piastri.id,
                dnfDriverID: DriverFixtures.leclerc.id
            ),
            userID: nil,
            draftGeneration: 3
        )

        XCTAssertEqual(
            state.apply(updatedState, outcome: .committed(ticket)),
            .dismiss(ticket)
        )
        XCTAssertEqual(state.selectedDriverIDs[.dnf], DriverFixtures.leclerc.id)
        XCTAssertFalse(state.isPresented)
    }

    func testRejectedOutcomeKeepsPreviousStateAndSheetPresented() {
        var state = DriverPickerState(
            activeSlot: .dnf,
            selectedDriverIDs: [
                .winner: DriverFixtures.norris.id,
                .p10: DriverFixtures.piastri.id,
            ],
            isLocked: false
        )
        var updatedState = state
        XCTAssertTrue(updatedState.select(DriverFixtures.leclerc))

        XCTAssertEqual(
            state.apply(updatedState, outcome: .rejected("Disk full")),
            .showError("Disk full")
        )
        XCTAssertNil(state.selectedDriverIDs[.dnf])
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

    private func makeTicket() -> PickCommitTicket {
        PickCommitTicket(
            recordID: LocalPickRecordID(owner: .guest, raceID: "spa"),
            revision: 7,
            selection: PickSelection(
                winnerDriverID: DriverFixtures.norris.id,
                tenthPlaceDriverID: DriverFixtures.piastri.id,
                dnfDriverID: DriverFixtures.leclerc.id
            ),
            userID: nil,
            draftGeneration: 3
        )
    }
}
