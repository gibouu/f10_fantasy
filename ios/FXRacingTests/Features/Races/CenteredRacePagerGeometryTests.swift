import XCTest
@testable import FXRacing

final class CenteredRacePagerGeometryTests: XCTestCase {
    func testPhoneWidthsUseSymmetricMarginsAndNoAdjacentPeek() {
        for width in [320.0, 375.0, 393.0, 402.0, 430.0] {
            let geometry = RacePagerGeometry(viewportWidth: width)

            XCTAssertEqual(geometry.cardWidth, width - 36, accuracy: 0.001)
            XCTAssertEqual(geometry.sideInset, 18, accuracy: 0.001)
            XCTAssertEqual(geometry.spacing, 18, accuracy: 0.001)
            XCTAssertEqual(geometry.adjacentPeek, 0, accuracy: 0.001)
        }
    }

    func testWideViewportCapsCardsAndKeepsCompleteCardsCentered() {
        let geometry = RacePagerGeometry(viewportWidth: 768)

        XCTAssertEqual(geometry.cardWidth, 430, accuracy: 0.001)
        XCTAssertEqual(geometry.sideInset, 169, accuracy: 0.001)
        XCTAssertEqual(geometry.spacing, 18, accuracy: 0.001)
        XCTAssertEqual(geometry.adjacentPeek, 0, accuracy: 0.001)
        XCTAssertEqual(
            geometry.sideInset * 2 + geometry.cardWidth,
            768,
            accuracy: 0.001
        )
    }

    func testFirstMiddleAndLastOffsetsCenterCardsAtEverySupportedWidth() {
        let itemCount = 5

        for width in [320.0, 375.0, 393.0, 402.0, 430.0, 768.0] {
            let geometry = RacePagerGeometry(viewportWidth: width)

            for index in [0, 2, 4] {
                let offset = geometry.contentOffset(
                    forCardAt: index,
                    itemCount: itemCount
                )
                let cardMidX = geometry.sideInset
                    + geometry.cardWidth / 2
                    + CGFloat(index) * (geometry.cardWidth + geometry.spacing)

                XCTAssertEqual(
                    cardMidX - offset,
                    width / 2,
                    accuracy: 0.001,
                    "Card \(index) should be centered at width \(width)"
                )
            }
        }
    }

    func testOffsetClampsOutOfRangeIndexesAndEmptyCollections() {
        let geometry = RacePagerGeometry(viewportWidth: 393)
        let stride = geometry.cardWidth + geometry.spacing

        XCTAssertEqual(
            geometry.contentOffset(forCardAt: -1, itemCount: 5),
            0,
            accuracy: 0.001
        )
        XCTAssertEqual(
            geometry.contentOffset(forCardAt: 99, itemCount: 5),
            4 * stride,
            accuracy: 0.001
        )
        XCTAssertEqual(
            geometry.contentOffset(forCardAt: 0, itemCount: 0),
            0,
            accuracy: 0.001
        )
    }

    func testTransientZeroWidthNeverProducesNegativeLayoutValues() {
        for width in [-1.0, 0.0, 20.0] {
            let geometry = RacePagerGeometry(viewportWidth: width)

            XCTAssertGreaterThanOrEqual(geometry.cardWidth, 0)
            XCTAssertGreaterThanOrEqual(geometry.sideInset, 0)
            XCTAssertGreaterThanOrEqual(geometry.adjacentPeek, 0)
        }
    }
}
