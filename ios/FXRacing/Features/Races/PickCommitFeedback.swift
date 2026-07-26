import SwiftUI

enum PickCommitMeasurement {
    static func perform<Span>(
        shouldMeasure: Bool,
        begin: () -> Span,
        end: (Span) -> Void,
        operation: () -> PickSelectionOutcome
    ) -> PickSelectionOutcome {
        guard shouldMeasure else { return operation() }
        let span = begin()
        defer { end(span) }
        return operation()
    }
}

enum PickCommitFeedbackEvent: Equatable, Sendable {
    case selection(PickSelectionOutcome)
    case backgroundAcknowledgement
    case hydration
}

enum PickCommitFeedbackEffect: Equatable, Sendable {
    case none
    case localPersistenceSucceeded
}

enum PickCommitFeedbackReducer {
    static func effect(
        for event: PickCommitFeedbackEvent
    ) -> PickCommitFeedbackEffect {
        guard case .selection(.committed) = event else { return .none }
        return .localPersistenceSucceeded
    }
}

@MainActor
enum PickCommitFeedback {
    static func publish(for event: PickCommitFeedbackEvent) {
        guard PickCommitFeedbackReducer.effect(for: event)
            == .localPersistenceSucceeded
        else { return }

        Haptics.success()
        AccessibilityNotification.Announcement(
            "Picks saved on this iPhone."
        ).post()
    }
}
