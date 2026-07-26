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
                458,
                "Card height should preserve the measured visual floor (rail must not clip) at \(size)"
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

    func testNormalSizeCardGeometryRemainsTask6Stable() {
        XCTAssertEqual(
            UpcomingCardLayoutMetrics.cardHeight(for: .large),
            458,
            accuracy: 0.001
        )
    }

    func testAccessibilitySizesProvideEnoughHeightForReflowedContent() {
        XCTAssertGreaterThanOrEqual(
            UpcomingCardLayoutMetrics.cardHeight(for: .accessibility5),
            1_160,
            "Largest accessibility cards need enough vertical room for a single-column header, three pick rows, status rail, and positive bottom inset without clipping"
        )
    }

    func testAccessibilityHeightBudgetIncludesFooterReserve() {
        let largestHeight = UpcomingCardLayoutMetrics.cardHeight(for: .accessibility5)
        let previousHeight = UpcomingCardLayoutMetrics.cardHeight(for: .accessibility4)

        XCTAssertGreaterThanOrEqual(
            largestHeight - previousHeight,
            100,
            "The largest accessibility card needs a deliberate footer reserve so status rows such as Choose 3 more, Saving..., Picks saved, Saved on this iPhone, conflict, failure, and Race locked stay fully inside the card"
        )
    }
}
