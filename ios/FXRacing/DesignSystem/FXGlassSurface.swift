import SwiftUI

enum FXSurfaceStyle: Equatable {
    case glass
    case material
    case opaque

    static func resolve(
        supportsGlass: Bool,
        reduceTransparency: Bool
    ) -> FXSurfaceStyle {
        if reduceTransparency { return .opaque }
        return supportsGlass ? .glass : .material
    }
}

enum FXGlassControlEmphasis {
    case regular
    case prominent
}

/// The only boundary that may add glass to compact controls and temporary surfaces.
/// Dense content cards continue to use `fxCardSurface`, which stays opaque.
struct FXGlassSurface<Content: View>: View {
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private let radius: CGFloat
    private let tint: Color?
    private let isInteractive: Bool
    private let content: Content

    init(
        radius: CGFloat = FXTheme.Radius.md,
        tint: Color? = nil,
        isInteractive: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
        self.radius = radius
        self.tint = tint
        self.isInteractive = isInteractive
        self.content = content()
    }

    @ViewBuilder
    var body: some View {
        switch FXSurfaceStyle.resolve(
            supportsGlass: supportsNativeGlass,
            reduceTransparency: reduceTransparency
        ) {
        case .glass:
            if #available(iOS 26.0, *) {
                content
                    .glassEffect(
                        Glass.regular.tint(tint).interactive(isInteractive),
                        in: RoundedRectangle(cornerRadius: radius, style: .continuous)
                    )
            } else {
                materialFallback
            }
        case .material:
            materialFallback
        case .opaque:
            opaqueFallback
        }
    }

    private var supportsNativeGlass: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }

    private var borderOpacity: Double {
        if colorSchemeContrast == .increased || differentiateWithoutColor { return 0.55 }
        return 0.25
    }

    private var borderColor: Color {
        if differentiateWithoutColor, let tint { return tint.opacity(0.8) }
        return Color(uiColor: .separator).opacity(borderOpacity)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }

    @ViewBuilder
    private var materialFallback: some View {
        if let tint {
            content
                .background(tint.opacity(0.92), in: shape)
                .overlay(shape.stroke(borderColor, lineWidth: 0.5))
                .shadow(color: tint.opacity(0.20), radius: 12, y: 6)
        } else {
            content
                .background(.thinMaterial, in: shape)
                .overlay(shape.stroke(borderColor, lineWidth: 0.5))
                .shadow(color: .black.opacity(0.10), radius: 12, y: 6)
        }
    }

    @ViewBuilder
    private var opaqueFallback: some View {
        if let tint {
            content
                .background(tint, in: shape)
                .overlay(shape.stroke(borderColor, lineWidth: 0.75))
                .shadow(color: tint.opacity(0.18), radius: 10, y: 5)
        } else {
            content
                .background(FXTheme.Colors.surfaceElevated, in: shape)
                .overlay(shape.stroke(borderColor, lineWidth: 0.75))
                .shadow(color: .black.opacity(0.08), radius: 10, y: 5)
        }
    }
}

extension View {
    /// Applies the native interactive glass effect where available and a thin-material fallback.
    func fxGlassControl(
        radius: CGFloat = FXTheme.Radius.md,
        emphasis: FXGlassControlEmphasis = .regular
    ) -> some View {
        FXGlassSurface(
            radius: radius,
            tint: emphasis == .prominent ? FXTheme.Colors.accent : nil,
            isInteractive: true
        ) {
            self
        }
    }
}
