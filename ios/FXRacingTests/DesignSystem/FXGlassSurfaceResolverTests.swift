import XCTest
@testable import FXRacing

final class FXGlassSurfaceResolverTests: XCTestCase {
    func testNativeGlassIsUsedOnlyWhenAvailableAndTransparencyIsAllowed() {
        XCTAssertEqual(
            FXSurfaceStyle.resolve(supportsGlass: true, reduceTransparency: false),
            .glass
        )
        XCTAssertEqual(
            FXSurfaceStyle.resolve(supportsGlass: false, reduceTransparency: false),
            .material
        )
    }

    func testReduceTransparencyAlwaysUsesOpaqueSurface() {
        XCTAssertEqual(
            FXSurfaceStyle.resolve(supportsGlass: true, reduceTransparency: true),
            .opaque
        )
        XCTAssertEqual(
            FXSurfaceStyle.resolve(supportsGlass: false, reduceTransparency: true),
            .opaque
        )
    }
}
