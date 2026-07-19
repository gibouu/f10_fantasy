import SwiftUI
import XCTest
@testable import FXRacing

final class UpcomingCardLayoutMetricsTests: XCTestCase {
    func testCardHeightsAreMonotonicAcrossDynamicTypeSizes() {
        let orderedSizes: [DynamicTypeSize] = [
            .xSmall,
            .small,
            .medium,
            .large,
            .xLarge,
            .xxLarge,
            .xxxLarge,
            .accessibility1,
            .accessibility2,
            .accessibility3,
            .accessibility4,
            .accessibility5,
        ]

        var previousHeight: CGFloat = 0
        for size in orderedSizes {
            let height = UpcomingCardLayoutMetrics.cardHeight(for: size)

            XCTAssertGreaterThanOrEqual(
                height,
                previousHeight,
                "Card height should not shrink at \(size)"
            )
            XCTAssertGreaterThanOrEqual(
                height,
                412,
                "Card height should preserve the current visual floor at \(size)"
            )
            previousHeight = height
        }
    }

    func testCardHeightIsStableAcrossHydrationAndAutosaveStates() {
        for size in [DynamicTypeSize.large, .accessibility2, .accessibility5] {
            let heights = UpcomingCardContentState.allCases.map {
                UpcomingCardLayoutMetrics.cardHeight(for: size, contentState: $0)
            }

            XCTAssertEqual(
                Set(heights).count,
                1,
                "Placeholder, hydrated, saving, conflict, and recovery-available states must use the same card height at \(size)"
            )
        }
    }
}
