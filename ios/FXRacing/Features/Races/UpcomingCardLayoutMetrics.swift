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

        // Measured from the uncapped card, then rounded up with a small margin.
        // Natural content heights were S 443, M 447, L 451, XL 461, XXL 470,
        // XXXL 480 — the previous values clipped the pick status rail at every
        // non-accessibility size. Keep these at or above the measurements: the
        // card hard-caps maxHeight to keep pager geometry stable, so anything
        // short is cut off rather than scrolled.
        return switch dynamicTypeSize {
        case .xSmall, .small, .medium, .large:
            458
        case .xLarge:
            468
        case .xxLarge:
            478
        case .xxxLarge:
            488
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
