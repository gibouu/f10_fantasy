import SwiftUI

enum UpcomingCardContentState: CaseIterable, Sendable {
    case placeholder
    case hydrated
    case saving
    case conflict
    case recoveryAvailable
}

enum UpcomingCardLayoutMetrics {
    static func cardHeight(
        for dynamicTypeSize: DynamicTypeSize,
        contentState: UpcomingCardContentState = .hydrated
    ) -> CGFloat {
        _ = contentState

        return switch dynamicTypeSize {
        case .xSmall, .small, .medium, .large:
            412
        case .xLarge:
            430
        case .xxLarge:
            448
        case .xxxLarge:
            468
        case .accessibility1:
            760
        case .accessibility2:
            840
        case .accessibility3:
            920
        case .accessibility4:
            1_060
        case .accessibility5:
            1_160
        @unknown default:
            1_160
        }
    }
}
